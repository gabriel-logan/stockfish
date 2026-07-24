use actix_web::{HttpResponse, web};
use chrono::{DateTime, Utc};
use shakmaty::fen::Fen;
use shakmaty::san::San;
use shakmaty::uci::UciMove;
use shakmaty::{CastlingMode, Chess, Color, EnPassantMode, Outcome, Position};
use tokio::time::{Duration, interval};
use uuid::Uuid;

use crate::AppState;
use crate::auth::AuthUser;
use crate::error::{ApiError, ApiResult};
use crate::hub::ServerMessage;
use crate::models::{Game, MoveRecord, PlayerInfo, Room};
use crate::users;

const STARTING_FEN: &str = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";
const RATING_K_FACTOR: f64 = 32.0;
const CLOCK_MONITOR_INTERVAL_MS: u64 = 500;

struct RoomTiming {
    rated: bool,
    increment_ms: i64,
}

pub struct MoveResult {
    pub game: Game,
    pub move_record: Option<MoveRecord>,
}

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

    let (white_player, black_player) = fetch_game_players(&state, &game).await;

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
) -> ApiResult<MoveResult> {
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

    let room_timing = get_room_timing(&mut tx, game.room_id).await?;

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

    let now = Utc::now();
    let (white_clock_ms, black_clock_ms) = clocks_after_elapsed(&game, now);
    let moving_clock_ms = if game.side_to_move == "white" {
        white_clock_ms
    } else {
        black_clock_ms
    };

    if moving_clock_ms <= 0 {
        let result = if game.side_to_move == "white" {
            "black_win"
        } else {
            "white_win"
        };
        let updated_game =
            finish_game_in_transaction(&mut tx, game, room_timing, result, "timeout", now).await?;

        tx.commit().await?;

        return Ok(MoveResult {
            game: updated_game,
            move_record: None,
        });
    }

    let historical_fens = list_move_fens(&mut tx, game.id).await?;
    let validated = validate_move(&game.fen, uci, &historical_fens)?;
    let move_number = game.move_count + 1;
    let status = if validated.result.is_some() {
        "finished"
    } else {
        "active"
    };

    let result_reason = validated
        .result
        .as_ref()
        .map(|_| validated.result_reason.as_str());
    let white_clock_ms = if game.side_to_move == "white" {
        white_clock_ms + room_timing.increment_ms
    } else {
        white_clock_ms
    };
    let black_clock_ms = if game.side_to_move == "black" {
        black_clock_ms + room_timing.increment_ms
    } else {
        black_clock_ms
    };
    let moving_clock_ms = if game.side_to_move == "white" {
        white_clock_ms
    } else {
        black_clock_ms
    };
    let pgn = append_pgn(&game, &validated.san, moving_clock_ms);
    let finished_at = validated.result.as_ref().map(|_| now);

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
            last_move_at = $9,
            finished_at = $10,
            white_clock_ms = $11,
            black_clock_ms = $12
        WHERE id = $1 AND status = 'active'
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
    .bind(now)
    .bind(finished_at)
    .bind(white_clock_ms)
    .bind(black_clock_ms)
    .fetch_one(&mut *tx)
    .await?;

    let move_record = sqlx::query_as::<_, MoveRecord>(
        r#"
        INSERT INTO moves (id, game_id, move_number, user_id, uci, san, fen_after, clock_ms)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        RETURNING id, game_id, move_number, user_id, uci, san, fen_after, clock_ms, created_at
        "#,
    )
    .bind(Uuid::new_v4())
    .bind(game.id)
    .bind(move_number)
    .bind(user_id)
    .bind(uci)
    .bind(&validated.san)
    .bind(&validated.fen_after)
    .bind(moving_clock_ms)
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

        if room_timing.rated {
            update_ratings(
                &mut tx,
                updated_game.white_user_id,
                updated_game.black_user_id,
                updated_game.result.as_deref().unwrap_or("draw"),
            )
            .await?;
        }
    }

    tx.commit().await?;

    Ok(MoveResult {
        game: updated_game,
        move_record: Some(move_record),
    })
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
        SELECT id, game_id, move_number, user_id, uci, san, fen_after, clock_ms, created_at
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

async fn list_move_fens(
    connection: &mut sqlx::PgConnection,
    game_id: Uuid,
) -> ApiResult<Vec<String>> {
    sqlx::query_scalar("SELECT fen_after FROM moves WHERE game_id = $1 ORDER BY move_number ASC")
        .bind(game_id)
        .fetch_all(&mut *connection)
        .await
        .map_err(ApiError::from)
}

pub fn ensure_player(game: &Game, user_id: Uuid) -> ApiResult<()> {
    if game.white_user_id != user_id && game.black_user_id != user_id {
        return Err(ApiError::Forbidden);
    }

    Ok(())
}

async fn fetch_player_info(state: &AppState, user_id: Uuid) -> ApiResult<PlayerInfo> {
    let user = users::get_user(state, user_id).await?;

    Ok(PlayerInfo {
        id: user.id,
        username: user.username,
        rating: user.rating,
    })
}

pub async fn fetch_game_players(
    state: &AppState,
    game: &Game,
) -> (Option<PlayerInfo>, Option<PlayerInfo>) {
    let white_player = fetch_player_info(state, game.white_user_id).await.ok();
    let black_player = fetch_player_info(state, game.black_user_id).await.ok();

    (white_player, black_player)
}

async fn finish_game(
    state: &AppState,
    game_id: Uuid,
    result: &str,
    result_reason: &str,
) -> ApiResult<Game> {
    let mut tx = state.db.begin().await?;

    let game = get_game_for_update(&mut tx, game_id)
        .await?
        .ok_or_else(|| ApiError::NotFound("game not found".to_owned()))?;

    if game.status != "active" {
        return Err(ApiError::BadRequest("game is already finished".to_owned()));
    }

    let room_timing = get_room_timing(&mut tx, game.room_id).await?;
    let game = finish_game_in_transaction(
        &mut tx,
        game,
        room_timing,
        result,
        result_reason,
        Utc::now(),
    )
    .await?;

    tx.commit().await?;

    Ok(game)
}

async fn get_game_for_update(
    connection: &mut sqlx::PgConnection,
    game_id: Uuid,
) -> ApiResult<Option<Game>> {
    sqlx::query_as::<_, Game>(
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
    .fetch_optional(&mut *connection)
    .await
    .map_err(ApiError::from)
}

async fn get_room_timing(
    connection: &mut sqlx::PgConnection,
    room_id: Uuid,
) -> ApiResult<RoomTiming> {
    let (rated, increment_seconds) = sqlx::query_as::<_, (bool, i32)>(
        "SELECT rated, increment_seconds FROM rooms WHERE id = $1",
    )
    .bind(room_id)
    .fetch_one(&mut *connection)
    .await?;

    Ok(RoomTiming {
        rated,
        increment_ms: i64::from(increment_seconds) * 1000,
    })
}

fn clocks_after_elapsed(game: &Game, now: DateTime<Utc>) -> (i64, i64) {
    let elapsed_ms = (now - game.last_move_at).num_milliseconds().max(0);
    let mut white_clock_ms = game.white_clock_ms;
    let mut black_clock_ms = game.black_clock_ms;

    if game.side_to_move == "white" {
        white_clock_ms -= elapsed_ms;
    } else {
        black_clock_ms -= elapsed_ms;
    }

    (white_clock_ms.max(0), black_clock_ms.max(0))
}

async fn finish_game_in_transaction(
    connection: &mut sqlx::PgConnection,
    game: Game,
    room_timing: RoomTiming,
    result: &str,
    result_reason: &str,
    now: DateTime<Utc>,
) -> ApiResult<Game> {
    let (white_clock_ms, black_clock_ms) = clocks_after_elapsed(&game, now);
    let updated_game = sqlx::query_as::<_, Game>(
        r#"
        UPDATE games
        SET status = 'finished',
            result = $2::game_result,
            result_reason = $3,
            finished_at = $4,
            white_clock_ms = $5,
            black_clock_ms = $6
        WHERE id = $1 AND status = 'active'
        RETURNING id, room_id, white_user_id, black_user_id, status::text, result::text,
            result_reason, fen, pgn, side_to_move, move_count, white_clock_ms, black_clock_ms,
            last_move_at, started_at, finished_at
        "#,
    )
    .bind(game.id)
    .bind(result)
    .bind(result_reason)
    .bind(now)
    .bind(white_clock_ms)
    .bind(black_clock_ms)
    .fetch_optional(&mut *connection)
    .await?
    .ok_or_else(|| ApiError::BadRequest("game is already finished".to_owned()))?;

    sqlx::query("UPDATE rooms SET status = 'finished', updated_at = now() WHERE id = $1")
        .bind(updated_game.room_id)
        .execute(&mut *connection)
        .await?;

    if room_timing.rated {
        update_ratings(
            connection,
            updated_game.white_user_id,
            updated_game.black_user_id,
            result,
        )
        .await?;
    }

    Ok(updated_game)
}

async fn expire_game(state: &AppState, game_id: Uuid) -> ApiResult<Option<Game>> {
    let mut tx = state.db.begin().await?;
    let Some(game) = get_game_for_update(&mut tx, game_id).await? else {
        tx.commit().await?;

        return Ok(None);
    };

    if game.status != "active" {
        tx.commit().await?;

        return Ok(None);
    }

    let room_timing = get_room_timing(&mut tx, game.room_id).await?;
    let now = Utc::now();
    let (white_clock_ms, black_clock_ms) = clocks_after_elapsed(&game, now);
    let moving_clock_ms = if game.side_to_move == "white" {
        white_clock_ms
    } else {
        black_clock_ms
    };

    if moving_clock_ms > 0 {
        tx.commit().await?;

        return Ok(None);
    }

    let result = if game.side_to_move == "white" {
        "black_win"
    } else {
        "white_win"
    };
    let updated_game =
        finish_game_in_transaction(&mut tx, game, room_timing, result, "timeout", now).await?;

    tx.commit().await?;

    Ok(Some(updated_game))
}

async fn expire_active_games(state: &AppState) -> ApiResult<()> {
    let game_ids = sqlx::query_scalar::<_, Uuid>("SELECT id FROM games WHERE status = 'active'")
        .fetch_all(&state.db)
        .await?;

    for game_id in game_ids {
        let Some(game) = expire_game(state, game_id).await? else {
            continue;
        };
        let (white_player, black_player) = fetch_game_players(state, &game).await;

        state.hub.broadcast_game(
            game.id,
            &ServerMessage::GameState {
                game,
                moves: serde_json::json!([]),
                white_player,
                black_player,
            },
        );
    }

    Ok(())
}

pub async fn run_clock_monitor(state: AppState) {
    let mut ticker = interval(Duration::from_millis(CLOCK_MONITOR_INTERVAL_MS));

    loop {
        ticker.tick().await;

        if let Err(error) = expire_active_games(&state).await {
            tracing::error!(error = %error, "clock monitor failed");
        }
    }
}

pub async fn finish_game_by_disconnect(
    state: &AppState,
    game_id: Uuid,
    disconnected_user_id: Uuid,
) -> ApiResult<Option<Game>> {
    let game = get_game_by_id(state, game_id).await?;
    ensure_player(&game, disconnected_user_id)?;

    if game.status != "active" {
        return Ok(None);
    }

    let result = if game.white_user_id == disconnected_user_id {
        "black_win"
    } else {
        "white_win"
    };

    finish_game(state, game.id, result, "disconnection")
        .await
        .map(Some)
}

async fn update_ratings(
    connection: &mut sqlx::PgConnection,
    white_user_id: Uuid,
    black_user_id: Uuid,
    result: &str,
) -> ApiResult<()> {
    let white_rating =
        sqlx::query_scalar::<_, i32>("SELECT rating FROM users WHERE id = $1 FOR UPDATE")
            .bind(white_user_id)
            .fetch_one(&mut *connection)
            .await?;
    let black_rating =
        sqlx::query_scalar::<_, i32>("SELECT rating FROM users WHERE id = $1 FOR UPDATE")
            .bind(black_user_id)
            .fetch_one(&mut *connection)
            .await?;

    let (white_change, black_change) = calculate_rating_changes(white_rating, black_rating, result);

    sqlx::query("UPDATE users SET rating = rating + $2, updated_at = now() WHERE id = $1")
        .bind(white_user_id)
        .bind(white_change)
        .execute(&mut *connection)
        .await?;
    sqlx::query("UPDATE users SET rating = rating + $2, updated_at = now() WHERE id = $1")
        .bind(black_user_id)
        .bind(black_change)
        .execute(&mut *connection)
        .await?;

    Ok(())
}

fn calculate_rating_changes(white_rating: i32, black_rating: i32, result: &str) -> (i32, i32) {
    let white_score = match result {
        "white_win" => 1.0,
        "black_win" => 0.0,
        _ => 0.5,
    };
    let expected_white_score =
        1.0 / (1.0 + 10.0_f64.powf(f64::from(black_rating - white_rating) / 400.0));
    let white_change = (RATING_K_FACTOR * (white_score - expected_white_score)).round() as i32;

    (white_change, -white_change)
}

struct ValidatedMove {
    san: String,
    fen_after: String,
    side_to_move: String,
    result: Option<String>,
    result_reason: String,
}

fn validate_move(fen: &str, uci: &str, historical_fens: &[String]) -> ApiResult<ValidatedMove> {
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
    let (result, result_reason) = result_from_position(&next_position, historical_fens);

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

fn result_from_position(position: &Chess, historical_fens: &[String]) -> (Option<String>, String) {
    if position.is_stalemate() {
        return (Some("draw".to_owned()), "stalemate".to_owned());
    }

    if position.is_insufficient_material() {
        return (Some("draw".to_owned()), "insufficient_material".to_owned());
    }

    if position.halfmoves() >= 100 {
        return (Some("draw".to_owned()), "fifty_move_rule".to_owned());
    }

    let current_fen = Fen::from_position(position, EnPassantMode::Legal).to_string();

    if has_threefold_repetition(historical_fens, &current_fen) {
        return (Some("draw".to_owned()), "threefold_repetition".to_owned());
    }

    result_from_outcome(position.outcome())
}

fn has_threefold_repetition(historical_fens: &[String], current_fen: &str) -> bool {
    let Some(current_key) = position_key(current_fen) else {
        return false;
    };

    let mut occurrences =
        usize::from(position_key(STARTING_FEN).as_deref() == Some(current_key.as_str()));

    for fen in historical_fens {
        if position_key(fen).as_deref() == Some(current_key.as_str()) {
            occurrences += 1;
        }
    }

    occurrences >= 3
}

fn position_key(fen: &str) -> Option<String> {
    let fields: Vec<&str> = fen.split_whitespace().take(4).collect();

    (fields.len() == 4).then(|| fields.join(" "))
}

fn format_pgn_clock(clock_ms: i64) -> String {
    let total_seconds = (clock_ms.max(0) + 999) / 1000;
    let hours = total_seconds / 3600;
    let minutes = (total_seconds % 3600) / 60;
    let seconds = total_seconds % 60;

    format!("{hours}:{minutes:02}:{seconds:02}")
}

fn append_pgn(game: &Game, san: &str, clock_ms: i64) -> String {
    let mut pgn = game.pgn.clone();
    let timed_san = format!("{san} {{[%clk {}]}}", format_pgn_clock(clock_ms));

    if game.side_to_move == "white" {
        if !pgn.is_empty() {
            pgn.push(' ');
        }

        let fullmove = (game.move_count / 2) + 1;
        pgn.push_str(&format!("{fullmove}. {timed_san}"));
    } else {
        pgn.push(' ');
        pgn.push_str(&timed_san);
    }

    pgn
}

#[cfg(test)]
mod tests {
    use super::*;

    fn game(side_to_move: &str, move_count: i32, pgn: &str) -> Game {
        let now = Utc::now();

        Game {
            id: Uuid::new_v4(),
            room_id: Uuid::new_v4(),
            white_user_id: Uuid::new_v4(),
            black_user_id: Uuid::new_v4(),
            status: "active".to_owned(),
            result: None,
            result_reason: None,
            fen: STARTING_FEN.to_owned(),
            pgn: pgn.to_owned(),
            side_to_move: side_to_move.to_owned(),
            move_count,
            white_clock_ms: 60_000,
            black_clock_ms: 60_000,
            last_move_at: now,
            started_at: now,
            finished_at: None,
        }
    }

    #[test]
    fn validates_a_legal_move() {
        let validated = validate_move(STARTING_FEN, "e2e4", &[]).unwrap();

        assert_eq!(validated.san, "e4");
        assert_eq!(validated.side_to_move, "black");
        assert!(
            validated
                .fen_after
                .starts_with("rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq")
        );
        assert!(validated.result.is_none());
    }

    #[test]
    fn rejects_invalid_position_and_illegal_move() {
        assert!(matches!(
            validate_move("not a fen", "e2e4", &[]),
            Err(ApiError::BadRequest(message)) if message == "invalid game position"
        ));
        assert!(matches!(
            validate_move(STARTING_FEN, "e2e5", &[]),
            Err(ApiError::BadRequest(message)) if message == "illegal move"
        ));
    }

    #[test]
    fn identifies_checkmate() {
        let fen = "rnb1kbnr/pppp1ppp/8/4p3/6Pq/5P2/PPPPP2P/RNBQKBNR w KQkq - 1 3";
        let (result, reason) = result_from_outcome(
            Fen::from_ascii(fen.as_bytes())
                .unwrap()
                .into_position::<Chess>(CastlingMode::Standard)
                .unwrap()
                .outcome(),
        );

        assert_eq!(result.as_deref(), Some("black_win"));
        assert_eq!(reason, "checkmate");
    }

    #[test]
    fn identifies_automatic_draw_reasons() {
        let stalemate = Fen::from_ascii(b"7k/5Q2/6K1/8/8/8/8/8 b - - 0 1")
            .unwrap()
            .into_position::<Chess>(CastlingMode::Standard)
            .unwrap();
        let insufficient_material = Fen::from_ascii(b"7k/8/8/8/8/8/8/K7 w - - 0 1")
            .unwrap()
            .into_position::<Chess>(CastlingMode::Standard)
            .unwrap();
        let fifty_move_rule = Fen::from_ascii(b"7k/8/8/8/8/8/8/R5K1 w - - 100 1")
            .unwrap()
            .into_position::<Chess>(CastlingMode::Standard)
            .unwrap();
        let repetition = Chess::default();
        let repeated_fens = vec![
            STARTING_FEN.to_owned(),
            "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 4 3".to_owned(),
        ];

        assert_eq!(result_from_position(&stalemate, &[]).1, "stalemate");
        assert_eq!(
            result_from_position(&insufficient_material, &[]).1,
            "insufficient_material"
        );
        assert_eq!(
            result_from_position(&fifty_move_rule, &[]).1,
            "fifty_move_rule"
        );
        assert_eq!(
            result_from_position(&repetition, &repeated_fens).1,
            "threefold_repetition"
        );
    }

    #[test]
    fn appends_white_and_black_moves_to_pgn() {
        assert_eq!(
            append_pgn(&game("white", 0, ""), "e4", 599_000),
            "1. e4 {[%clk 0:09:59]}"
        );
        assert_eq!(
            append_pgn(&game("black", 1, "1. e4 {[%clk 0:09:59]}"), "e5", 598_000),
            "1. e4 {[%clk 0:09:59]} e5 {[%clk 0:09:58]}"
        );
        assert_eq!(
            append_pgn(
                &game("white", 2, "1. e4 {[%clk 0:09:59]} e5 {[%clk 0:09:58]}"),
                "Nf3",
                597_000
            ),
            "1. e4 {[%clk 0:09:59]} e5 {[%clk 0:09:58]} 2. Nf3 {[%clk 0:09:57]}"
        );
    }

    #[test]
    fn formats_pgn_clock_with_hours_minutes_and_seconds() {
        assert_eq!(format_pgn_clock(3_723_001), "1:02:04");
        assert_eq!(format_pgn_clock(0), "0:00:00");
    }

    #[test]
    fn permits_only_game_players() {
        let game = game("white", 0, "");

        assert!(ensure_player(&game, game.white_user_id).is_ok());
        assert!(ensure_player(&game, game.black_user_id).is_ok());
        assert!(matches!(
            ensure_player(&game, Uuid::new_v4()),
            Err(ApiError::Forbidden)
        ));
    }

    #[test]
    fn applies_symmetric_rating_changes_to_equal_players() {
        assert_eq!(calculate_rating_changes(400, 400, "white_win"), (16, -16));
        assert_eq!(calculate_rating_changes(400, 400, "black_win"), (-16, 16));
        assert_eq!(calculate_rating_changes(400, 400, "draw"), (0, 0));
    }

    #[test]
    fn favors_the_lower_rated_player_with_a_win() {
        let (white_change, black_change) = calculate_rating_changes(800, 1200, "white_win");

        assert!(white_change > 16);
        assert_eq!(black_change, -white_change);
    }

    #[test]
    fn subtracts_elapsed_time_only_from_the_side_to_move() {
        let mut game = game("white", 0, "");
        let now = Utc::now();
        game.last_move_at = now - chrono::Duration::milliseconds(1_500);
        game.white_clock_ms = 3_000;
        game.black_clock_ms = 5_000;

        assert_eq!(clocks_after_elapsed(&game, now), (1_500, 5_000));
    }
}
