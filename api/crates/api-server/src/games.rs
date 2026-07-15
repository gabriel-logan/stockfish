use actix_web::{HttpResponse, web};
use chrono::Utc;
use shakmaty::fen::Fen;
use shakmaty::san::San;
use shakmaty::uci::UciMove;
use shakmaty::{CastlingMode, Chess, Color, EnPassantMode, Outcome, Position};
use uuid::Uuid;

use crate::AppState;
use crate::auth::AuthUser;
use crate::error::{ApiError, ApiResult};
use crate::hub::ServerMessage;
use crate::models::{Game, MoveRecord, PlayerInfo, Room};
use crate::users;

const STARTING_FEN: &str = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";

pub async fn get_game(
    state: web::Data<AppState>,
    user: AuthUser,
    game_id: web::Path<Uuid>,
) -> ApiResult<HttpResponse> {
    let game = get_game_by_id(&state, *game_id).await?;
    ensure_player(&game, user.id)?;
    let moves = list_moves(&state, game.id).await?;

    Ok(HttpResponse::Ok().json(serde_json::json!({
        "game": game,
        "moves": moves
    })))
}

pub async fn resign_game(
    state: web::Data<AppState>,
    user: AuthUser,
    game_id: web::Path<Uuid>,
) -> ApiResult<web::Json<Game>> {
    let game = get_game_by_id(&state, *game_id).await?;
    ensure_player(&game, user.id)?;

    if game.status != "active" {
        return Err(ApiError::BadRequest("game is already finished".to_owned()));
    }

    let result = if game.white_user_id == user.id {
        "black_win"
    } else {
        "white_win"
    };

    let game = finish_game(&state, game.id, result, "resignation").await?;

    let white_player = fetch_player_info(&state, game.white_user_id).await.ok();
    let black_player = fetch_player_info(&state, game.black_user_id).await.ok();

    state.hub.broadcast_game(
        game.id,
        &ServerMessage::GameState {
            game: game.clone(),
            moves: serde_json::json!([]),
            white_player,
            black_player,
        },
    );

    Ok(web::Json(game))
}

pub async fn start_game_if_ready(state: &AppState, room: &Room) -> ApiResult<Option<Game>> {
    let Some(white_user_id) = room.white_user_id else {
        return Ok(None);
    };
    let Some(black_user_id) = room.black_user_id else {
        return Ok(None);
    };

    let existing_game = sqlx::query_scalar::<_, Uuid>("SELECT id FROM games WHERE room_id = $1")
        .bind(room.id)
        .fetch_optional(&state.db)
        .await?;

    if existing_game.is_some() {
        return Ok(None);
    }

    let game_id = Uuid::new_v4();
    let clock_ms = i64::from(room.time_control_seconds) * 1000;

    let mut tx = state.db.begin().await?;

    let game = sqlx::query_as::<_, Game>(
        r#"
        INSERT INTO games (
            id, room_id, white_user_id, black_user_id, fen, white_clock_ms, black_clock_ms
        )
        VALUES ($1, $2, $3, $4, $5, $6, $6)
        RETURNING id, room_id, white_user_id, black_user_id, status::text, result::text,
            result_reason, fen, pgn, side_to_move, move_count, white_clock_ms, black_clock_ms,
            last_move_at, started_at, finished_at
        "#,
    )
    .bind(game_id)
    .bind(room.id)
    .bind(white_user_id)
    .bind(black_user_id)
    .bind(STARTING_FEN)
    .bind(clock_ms)
    .fetch_one(&mut *tx)
    .await?;

    sqlx::query(
        r#"
        UPDATE rooms
        SET status = 'playing', updated_at = now()
        WHERE id = $1
        "#,
    )
    .bind(room.id)
    .execute(&mut *tx)
    .await?;

    tx.commit().await?;

    Ok(Some(game))
}

pub async fn play_uci_move(
    state: &AppState,
    user_id: Uuid,
    game_id: Uuid,
    uci: &str,
) -> ApiResult<(Game, MoveRecord)> {
    let mut tx = state.db.begin().await?;

    let game = sqlx::query_as::<_, Game>(
        r#"
        SELECT id, room_id, white_user_id, black_user_id, status::text, result::text,
            result_reason, fen, pgn, side_to_move, move_count, white_clock_ms, black_clock_ms,
            last_move_at, started_at, finished_at
        FROM games
        WHERE id = $1
        FOR UPDATE
        "#,
    )
    .bind(game_id)
    .fetch_optional(&mut *tx)
    .await?
    .ok_or_else(|| ApiError::NotFound("game not found".to_owned()))?;

    ensure_player(&game, user_id)?;

    if game.status != "active" {
        return Err(ApiError::BadRequest("game is finished".to_owned()));
    }

    let expected_user = if game.side_to_move == "white" {
        game.white_user_id
    } else {
        game.black_user_id
    };

    if expected_user != user_id {
        return Err(ApiError::Forbidden);
    }

    let validated = validate_move(&game.fen, uci)?;
    let move_number = game.move_count + 1;
    let pgn = append_pgn(&game, &validated.san);
    let status = if validated.result.is_some() {
        "finished"
    } else {
        "active"
    };

    let result_reason = validated
        .result
        .as_ref()
        .map(|_| validated.result_reason.as_str());
    let finished_at = validated.result.as_ref().map(|_| Utc::now());

    let updated_game = sqlx::query_as::<_, Game>(
        r#"
        UPDATE games
        SET status = $2::game_status,
            result = $3::game_result,
            result_reason = $4,
            fen = $5,
            pgn = $6,
            side_to_move = $7,
            move_count = $8,
            last_move_at = now(),
            finished_at = $9
        WHERE id = $1
        RETURNING id, room_id, white_user_id, black_user_id, status::text, result::text,
            result_reason, fen, pgn, side_to_move, move_count, white_clock_ms, black_clock_ms,
            last_move_at, started_at, finished_at
        "#,
    )
    .bind(game.id)
    .bind(status)
    .bind(validated.result.as_deref())
    .bind(result_reason)
    .bind(&validated.fen_after)
    .bind(pgn)
    .bind(&validated.side_to_move)
    .bind(move_number)
    .bind(finished_at)
    .fetch_one(&mut *tx)
    .await?;

    let move_record = sqlx::query_as::<_, MoveRecord>(
        r#"
        INSERT INTO moves (id, game_id, move_number, user_id, uci, san, fen_after)
        VALUES ($1, $2, $3, $4, $5, $6, $7)
        RETURNING id, game_id, move_number, user_id, uci, san, fen_after, created_at
        "#,
    )
    .bind(Uuid::new_v4())
    .bind(game.id)
    .bind(move_number)
    .bind(user_id)
    .bind(uci)
    .bind(&validated.san)
    .bind(&validated.fen_after)
    .fetch_one(&mut *tx)
    .await?;

    if updated_game.status == "finished" {
        sqlx::query(
            r#"
            UPDATE rooms
            SET status = 'finished', updated_at = now()
            WHERE id = $1
            "#,
        )
        .bind(updated_game.room_id)
        .execute(&mut *tx)
        .await?;
    }

    tx.commit().await?;

    Ok((updated_game, move_record))
}

pub async fn get_game_by_id(state: &AppState, game_id: Uuid) -> ApiResult<Game> {
    sqlx::query_as::<_, Game>(
        r#"
        SELECT id, room_id, white_user_id, black_user_id, status::text, result::text,
            result_reason, fen, pgn, side_to_move, move_count, white_clock_ms, black_clock_ms,
            last_move_at, started_at, finished_at
        FROM games
        WHERE id = $1
        "#,
    )
    .bind(game_id)
    .fetch_optional(&state.db)
    .await?
    .ok_or_else(|| ApiError::NotFound("game not found".to_owned()))
}

pub async fn list_moves(state: &AppState, game_id: Uuid) -> ApiResult<Vec<MoveRecord>> {
    sqlx::query_as::<_, MoveRecord>(
        r#"
        SELECT id, game_id, move_number, user_id, uci, san, fen_after, created_at
        FROM moves
        WHERE game_id = $1
        ORDER BY move_number ASC
        "#,
    )
    .bind(game_id)
    .fetch_all(&state.db)
    .await
    .map_err(ApiError::from)
}

pub fn ensure_player(game: &Game, user_id: Uuid) -> ApiResult<()> {
    if game.white_user_id != user_id && game.black_user_id != user_id {
        return Err(ApiError::Forbidden);
    }

    Ok(())
}

pub async fn fetch_player_info(state: &AppState, user_id: Uuid) -> ApiResult<PlayerInfo> {
    let user = users::get_user(state, user_id).await?;

    Ok(PlayerInfo {
        id: user.id,
        username: user.username,
        rating: user.rating,
    })
}

async fn finish_game(
    state: &AppState,
    game_id: Uuid,
    result: &str,
    result_reason: &str,
) -> ApiResult<Game> {
    let mut tx = state.db.begin().await?;

    let game = sqlx::query_as::<_, Game>(
        r#"
        UPDATE games
        SET status = 'finished',
            result = $2::game_result,
            result_reason = $3,
            finished_at = now()
        WHERE id = $1
        RETURNING id, room_id, white_user_id, black_user_id, status::text, result::text,
            result_reason, fen, pgn, side_to_move, move_count, white_clock_ms, black_clock_ms,
            last_move_at, started_at, finished_at
        "#,
    )
    .bind(game_id)
    .bind(result)
    .bind(result_reason)
    .fetch_one(&mut *tx)
    .await?;

    sqlx::query("UPDATE rooms SET status = 'finished', updated_at = now() WHERE id = $1")
        .bind(game.room_id)
        .execute(&mut *tx)
        .await?;

    tx.commit().await?;

    Ok(game)
}

struct ValidatedMove {
    san: String,
    fen_after: String,
    side_to_move: String,
    result: Option<String>,
    result_reason: String,
}

fn validate_move(fen: &str, uci: &str) -> ApiResult<ValidatedMove> {
    let position: Chess = Fen::from_ascii(fen.as_bytes())
        .map_err(|_| ApiError::BadRequest("invalid game position".to_owned()))?
        .into_position(CastlingMode::Standard)
        .map_err(|_| ApiError::BadRequest("invalid game position".to_owned()))?;

    let uci_move: UciMove = uci
        .parse()
        .map_err(|_| ApiError::BadRequest("invalid uci move".to_owned()))?;
    let chess_move = uci_move
        .to_move(&position)
        .map_err(|_| ApiError::BadRequest("illegal move".to_owned()))?;
    let san = San::from_move(&position, chess_move).to_string();
    let next_position = position
        .play(chess_move)
        .map_err(|_| ApiError::BadRequest("illegal move".to_owned()))?;
    let fen_after = Fen::from_position(&next_position, EnPassantMode::Legal).to_string();
    let side_to_move = match next_position.turn() {
        Color::White => "white",
        Color::Black => "black",
    }
    .to_owned();
    let (result, result_reason) = result_from_outcome(next_position.outcome());

    Ok(ValidatedMove {
        san,
        fen_after,
        side_to_move,
        result,
        result_reason,
    })
}

fn result_from_outcome(outcome: Outcome) -> (Option<String>, String) {
    if outcome.is_unknown() {
        return (None, String::new());
    }

    let Some(winner) = outcome.winner() else {
        return (Some("draw".to_owned()), "draw".to_owned());
    };

    let result = match winner {
        Color::White => "white_win",
        Color::Black => "black_win",
    };

    (Some(result.to_owned()), "checkmate".to_owned())
}

fn append_pgn(game: &Game, san: &str) -> String {
    let mut pgn = game.pgn.clone();

    if game.side_to_move == "white" {
        if !pgn.is_empty() {
            pgn.push(' ');
        }

        let fullmove = (game.move_count / 2) + 1;
        pgn.push_str(&format!("{fullmove}. {san}"));
    } else {
        pgn.push(' ');
        pgn.push_str(san);
    }

    pgn
}
