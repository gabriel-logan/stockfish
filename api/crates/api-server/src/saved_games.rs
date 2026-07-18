use actix_web::web;
use uuid::Uuid;

use crate::AppState;
use crate::auth::AuthUser;
use crate::error::{ApiError, ApiResult};
use crate::models::{CreateSavedGameRequest, RenameSavedGameRequest, SavedGame};

pub async fn list_saved_games(
    state: web::Data<AppState>,
    user: AuthUser,
) -> ApiResult<web::Json<Vec<SavedGame>>> {
    let saved_games = sqlx::query_as::<_, SavedGame>(
        r#"
        SELECT id, name, pgn, created_at AS date, result, opponent, opening, player_color,
            bot_elo, moves
        FROM saved_games
        WHERE user_id = $1
        ORDER BY created_at DESC
        "#,
    )
    .bind(user.id)
    .fetch_all(&state.db)
    .await?;

    Ok(web::Json(saved_games))
}

pub async fn create_saved_game(
    state: web::Data<AppState>,
    user: AuthUser,
    body: web::Json<CreateSavedGameRequest>,
) -> ApiResult<web::Json<SavedGame>> {
    validate_create_request(&body)?;

    let name = normalize_optional_text(body.name.as_deref());
    let opening = normalize_optional_text(body.opening.as_deref());
    let result = body.result.trim();
    let opponent = body.opponent.trim();

    let saved_game = sqlx::query_as::<_, SavedGame>(
        r#"
        INSERT INTO saved_games (
            id, user_id, name, pgn, result, opponent, opening, player_color, bot_elo, moves
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
        RETURNING id, name, pgn, created_at AS date, result, opponent, opening, player_color,
            bot_elo, moves
        "#,
    )
    .bind(Uuid::new_v4())
    .bind(user.id)
    .bind(name)
    .bind(&body.pgn)
    .bind(result)
    .bind(opponent)
    .bind(opening)
    .bind(&body.player_color)
    .bind(body.bot_elo)
    .bind(body.moves)
    .fetch_one(&state.db)
    .await?;

    Ok(web::Json(saved_game))
}

pub async fn rename_saved_game(
    state: web::Data<AppState>,
    user: AuthUser,
    saved_game_id: web::Path<Uuid>,
    body: web::Json<RenameSavedGameRequest>,
) -> ApiResult<web::Json<SavedGame>> {
    let name = normalize_optional_text(body.name.as_deref());

    let saved_game = sqlx::query_as::<_, SavedGame>(
        r#"
        UPDATE saved_games
        SET name = $3, updated_at = now()
        WHERE id = $1 AND user_id = $2
        RETURNING id, name, pgn, created_at AS date, result, opponent, opening, player_color,
            bot_elo, moves
        "#,
    )
    .bind(*saved_game_id)
    .bind(user.id)
    .bind(name)
    .fetch_optional(&state.db)
    .await?
    .ok_or_else(|| ApiError::NotFound("saved game not found".to_owned()))?;

    Ok(web::Json(saved_game))
}

pub async fn delete_saved_game(
    state: web::Data<AppState>,
    user: AuthUser,
    saved_game_id: web::Path<Uuid>,
) -> ApiResult<web::Json<serde_json::Value>> {
    let result = sqlx::query(
        r#"
        DELETE FROM saved_games
        WHERE id = $1 AND user_id = $2
        "#,
    )
    .bind(*saved_game_id)
    .bind(user.id)
    .execute(&state.db)
    .await?;

    if result.rows_affected() == 0 {
        return Err(ApiError::NotFound("saved game not found".to_owned()));
    }

    Ok(web::Json(serde_json::json!({ "ok": true })))
}

fn validate_create_request(body: &CreateSavedGameRequest) -> ApiResult<()> {
    if body.pgn.trim().is_empty() {
        return Err(ApiError::BadRequest("pgn is required".to_owned()));
    }

    if body.result.trim().is_empty() {
        return Err(ApiError::BadRequest("result is required".to_owned()));
    }

    if body.opponent.trim().is_empty() {
        return Err(ApiError::BadRequest("opponent is required".to_owned()));
    }

    if body.player_color != "w" && body.player_color != "b" {
        return Err(ApiError::BadRequest(
            "playerColor must be w or b".to_owned(),
        ));
    }

    if body.moves < 0 {
        return Err(ApiError::BadRequest(
            "moves must be zero or greater".to_owned(),
        ));
    }

    if body.bot_elo.is_some_and(|bot_elo| bot_elo < 0) {
        return Err(ApiError::BadRequest(
            "botElo must be zero or greater".to_owned(),
        ));
    }

    Ok(())
}

fn normalize_optional_text(value: Option<&str>) -> Option<String> {
    value
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(str::to_owned)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn valid_request() -> CreateSavedGameRequest {
        CreateSavedGameRequest {
            name: None,
            pgn: "1. e4 e5".to_owned(),
            result: "*".to_owned(),
            opponent: "Stockfish".to_owned(),
            opening: None,
            player_color: "w".to_owned(),
            bot_elo: Some(400),
            moves: 2,
        }
    }

    #[test]
    fn validates_create_request() {
        assert!(validate_create_request(&valid_request()).is_ok());

        let mut missing_pgn = valid_request();
        missing_pgn.pgn = " ".to_owned();
        assert!(validate_create_request(&missing_pgn).is_err());

        let mut invalid_color = valid_request();
        invalid_color.player_color = "white".to_owned();
        assert!(validate_create_request(&invalid_color).is_err());

        let mut invalid_moves = valid_request();
        invalid_moves.moves = -1;
        assert!(validate_create_request(&invalid_moves).is_err());

        let mut invalid_elo = valid_request();
        invalid_elo.bot_elo = Some(-1);
        assert!(validate_create_request(&invalid_elo).is_err());
    }

    #[test]
    fn normalizes_optional_text() {
        assert_eq!(
            normalize_optional_text(Some("  game  ")),
            Some("game".to_owned())
        );
        assert_eq!(normalize_optional_text(Some("   ")), None);
        assert_eq!(normalize_optional_text(None), None);
    }
}
