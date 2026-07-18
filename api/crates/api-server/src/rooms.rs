use actix_web::{HttpResponse, web};
use uuid::Uuid;

use crate::AppState;
use crate::auth::AuthUser;
use crate::error::{ApiError, ApiResult};
use crate::games;
use crate::hub::ServerMessage;
use crate::models::{CreateRoomRequest, Game, MatchmakingRequest, Room};

const DEFAULT_VISIBILITY: &str = "public";
const DEFAULT_RATED: bool = false;
const DEFAULT_TIME_CONTROL_SECONDS: i32 = 600;
const DEFAULT_INCREMENT_SECONDS: i32 = 0;

pub async fn create_room(
    state: web::Data<AppState>,
    user: AuthUser,
    body: web::Json<CreateRoomRequest>,
) -> ApiResult<web::Json<Room>> {
    let room = create_room_record(
        &state,
        user.id,
        body.visibility.as_deref().unwrap_or(DEFAULT_VISIBILITY),
        body.rated.unwrap_or(DEFAULT_RATED),
        body.time_control_seconds
            .unwrap_or(DEFAULT_TIME_CONTROL_SECONDS),
        body.increment_seconds.unwrap_or(DEFAULT_INCREMENT_SECONDS),
    )
    .await?;

    state
        .hub
        .broadcast_room(room.id, &ServerMessage::RoomUpdated { room: room.clone() });

    Ok(web::Json(room))
}

pub async fn list_rooms(state: web::Data<AppState>) -> ApiResult<web::Json<Vec<Room>>> {
    let rooms = sqlx::query_as::<_, Room>(
        r#"
        SELECT id, owner_id, status::text, visibility::text, rated, time_control_seconds,
            increment_seconds, white_user_id, black_user_id, created_at, updated_at
        FROM rooms
        WHERE status = 'waiting' AND visibility = 'public'
        ORDER BY created_at ASC
        LIMIT 100
        "#,
    )
    .fetch_all(&state.db)
    .await?;

    Ok(web::Json(rooms))
}

pub async fn get_room(
    state: web::Data<AppState>,
    room_id: web::Path<Uuid>,
) -> ApiResult<web::Json<Room>> {
    let room = get_room_by_id(&state, *room_id).await?;

    Ok(web::Json(room))
}

pub async fn join_room(
    state: web::Data<AppState>,
    user: AuthUser,
    room_id: web::Path<Uuid>,
) -> ApiResult<HttpResponse> {
    let (room, game) = join_room_and_start_game(&state, user.id, *room_id).await?;

    if let Some(game) = game {
        return Ok(HttpResponse::Ok().json(serde_json::json!({
            "room": room,
            "game": game
        })));
    }

    Ok(HttpResponse::Ok().json(serde_json::json!({ "room": room })))
}

pub async fn join_matchmaking(
    state: web::Data<AppState>,
    user: AuthUser,
    body: web::Json<MatchmakingRequest>,
) -> ApiResult<HttpResponse> {
    let time_control_seconds = body
        .time_control_seconds
        .unwrap_or(DEFAULT_TIME_CONTROL_SECONDS);
    let increment_seconds = body.increment_seconds.unwrap_or(DEFAULT_INCREMENT_SECONDS);
    let rated = body.rated.unwrap_or(DEFAULT_RATED);

    if let Some(room) = find_waiting_room(
        &state,
        user.id,
        rated,
        time_control_seconds,
        increment_seconds,
    )
    .await?
    {
        let (room, game) = join_room_and_start_game(&state, user.id, room.id).await?;

        if let Some(game) = game {
            return Ok(HttpResponse::Ok().json(serde_json::json!({
                "matched": true,
                "room": room,
                "game": game
            })));
        }
    }

    let room = create_room_record(
        &state,
        user.id,
        DEFAULT_VISIBILITY,
        rated,
        time_control_seconds,
        increment_seconds,
    )
    .await?;

    Ok(HttpResponse::Ok().json(serde_json::json!({
        "matched": false,
        "room": room
    })))
}

pub async fn leave_matchmaking(
    state: web::Data<AppState>,
    user: AuthUser,
) -> ApiResult<web::Json<serde_json::Value>> {
    sqlx::query(
        r#"
        UPDATE rooms
        SET status = 'cancelled', updated_at = now()
        WHERE owner_id = $1 AND status = 'waiting' AND black_user_id IS NULL
        "#,
    )
    .bind(user.id)
    .execute(&state.db)
    .await?;

    Ok(web::Json(serde_json::json!({ "ok": true })))
}

pub async fn get_room_by_id(state: &AppState, room_id: Uuid) -> ApiResult<Room> {
    sqlx::query_as::<_, Room>(
        r#"
        SELECT id, owner_id, status::text, visibility::text, rated, time_control_seconds,
            increment_seconds, white_user_id, black_user_id, created_at, updated_at
        FROM rooms
        WHERE id = $1
        "#,
    )
    .bind(room_id)
    .fetch_optional(&state.db)
    .await?
    .ok_or_else(|| ApiError::NotFound("room not found".to_owned()))
}

async fn join_room_and_start_game(
    state: &AppState,
    user_id: Uuid,
    room_id: Uuid,
) -> ApiResult<(Room, Option<Game>)> {
    let room = join_room_record(state, user_id, room_id).await?;
    let game = games::start_game_if_ready(state, &room).await?;

    state
        .hub
        .broadcast_room(room.id, &ServerMessage::RoomUpdated { room: room.clone() });

    if let Some(game) = &game {
        let message = ServerMessage::GameStarted { game: game.clone() };

        state.hub.broadcast_room(room.id, &message);
        state.hub.broadcast_game(game.id, &message);
    }

    Ok((room, game))
}

async fn create_room_record(
    state: &AppState,
    owner_id: Uuid,
    visibility: &str,
    rated: bool,
    time_control_seconds: i32,
    increment_seconds: i32,
) -> ApiResult<Room> {
    validate_room_options(visibility, time_control_seconds, increment_seconds)?;

    sqlx::query_as::<_, Room>(
        r#"
        INSERT INTO rooms (
            id, owner_id, visibility, rated, time_control_seconds, increment_seconds, white_user_id
        )
        VALUES ($1, $2, $3::room_visibility, $4, $5, $6, $2)
        RETURNING id, owner_id, status::text, visibility::text, rated, time_control_seconds,
            increment_seconds, white_user_id, black_user_id, created_at, updated_at
        "#,
    )
    .bind(Uuid::new_v4())
    .bind(owner_id)
    .bind(visibility)
    .bind(rated)
    .bind(time_control_seconds)
    .bind(increment_seconds)
    .fetch_one(&state.db)
    .await
    .map_err(ApiError::from)
}

async fn join_room_record(state: &AppState, user_id: Uuid, room_id: Uuid) -> ApiResult<Room> {
    let mut tx = state.db.begin().await?;

    let room = sqlx::query_as::<_, Room>(
        r#"
        SELECT id, owner_id, status::text, visibility::text, rated, time_control_seconds,
            increment_seconds, white_user_id, black_user_id, created_at, updated_at
        FROM rooms
        WHERE id = $1
        FOR UPDATE
        "#,
    )
    .bind(room_id)
    .fetch_optional(&mut *tx)
    .await?
    .ok_or_else(|| ApiError::NotFound("room not found".to_owned()))?;

    if room.status != "waiting" {
        return Err(ApiError::BadRequest("room is not waiting".to_owned()));
    }

    if room.white_user_id == Some(user_id) || room.black_user_id == Some(user_id) {
        tx.commit().await?;

        return Ok(room);
    }

    if room.black_user_id.is_some() {
        return Err(ApiError::BadRequest("room is full".to_owned()));
    }

    let room = sqlx::query_as::<_, Room>(
        r#"
        UPDATE rooms
        SET black_user_id = $2, updated_at = now()
        WHERE id = $1
        RETURNING id, owner_id, status::text, visibility::text, rated, time_control_seconds,
            increment_seconds, white_user_id, black_user_id, created_at, updated_at
        "#,
    )
    .bind(room_id)
    .bind(user_id)
    .fetch_one(&mut *tx)
    .await?;

    tx.commit().await?;

    Ok(room)
}

async fn find_waiting_room(
    state: &AppState,
    user_id: Uuid,
    rated: bool,
    time_control_seconds: i32,
    increment_seconds: i32,
) -> ApiResult<Option<Room>> {
    sqlx::query_as::<_, Room>(
        r#"
        SELECT id, owner_id, status::text, visibility::text, rated, time_control_seconds,
            increment_seconds, white_user_id, black_user_id, created_at, updated_at
        FROM rooms
        WHERE status = 'waiting'
            AND visibility = 'public'
            AND rated = $1
            AND time_control_seconds = $2
            AND increment_seconds = $3
            AND owner_id <> $4
            AND black_user_id IS NULL
        ORDER BY created_at ASC
        LIMIT 1
        "#,
    )
    .bind(rated)
    .bind(time_control_seconds)
    .bind(increment_seconds)
    .bind(user_id)
    .fetch_optional(&state.db)
    .await
    .map_err(ApiError::from)
}

fn validate_room_options(
    visibility: &str,
    time_control_seconds: i32,
    increment_seconds: i32,
) -> ApiResult<()> {
    if visibility != "public" && visibility != "private" {
        return Err(ApiError::BadRequest(
            "visibility must be public or private".to_owned(),
        ));
    }

    if !(60..=10800).contains(&time_control_seconds) {
        return Err(ApiError::BadRequest(
            "timeControlSeconds must be between 60 and 10800".to_owned(),
        ));
    }

    if !(0..=60).contains(&increment_seconds) {
        return Err(ApiError::BadRequest(
            "incrementSeconds must be between 0 and 60".to_owned(),
        ));
    }

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn accepts_valid_room_option_boundaries() {
        assert!(validate_room_options("public", 60, 0).is_ok());
        assert!(validate_room_options("private", 10_800, 60).is_ok());
    }

    #[test]
    fn rejects_invalid_visibility() {
        assert!(matches!(
            validate_room_options("friends", 600, 0),
            Err(ApiError::BadRequest(message)) if message == "visibility must be public or private"
        ));
    }

    #[test]
    fn rejects_time_control_outside_range() {
        assert!(validate_room_options("public", 59, 0).is_err());
        assert!(validate_room_options("public", 10_801, 0).is_err());
    }

    #[test]
    fn rejects_increment_outside_range() {
        assert!(validate_room_options("public", 600, -1).is_err());
        assert!(validate_room_options("public", 600, 61).is_err());
    }
}
