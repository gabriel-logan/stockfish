use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use sqlx::FromRow;
use uuid::Uuid;

#[derive(Debug, Clone, Serialize, FromRow)]
#[serde(rename_all = "camelCase")]
pub struct User {
    pub id: Uuid,
    pub username: String,
    pub email: String,
    pub rating: i32,
    pub created_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Serialize, FromRow)]
#[serde(rename_all = "camelCase")]
pub struct Room {
    pub id: Uuid,
    pub owner_id: Uuid,
    pub status: String,
    pub visibility: String,
    pub rated: bool,
    pub time_control_seconds: i32,
    pub increment_seconds: i32,
    pub white_user_id: Option<Uuid>,
    pub black_user_id: Option<Uuid>,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Serialize, FromRow)]
#[serde(rename_all = "camelCase")]
pub struct Game {
    pub id: Uuid,
    pub room_id: Uuid,
    pub white_user_id: Uuid,
    pub black_user_id: Uuid,
    pub status: String,
    pub result: Option<String>,
    pub result_reason: Option<String>,
    pub fen: String,
    pub pgn: String,
    pub side_to_move: String,
    pub move_count: i32,
    pub white_clock_ms: i64,
    pub black_clock_ms: i64,
    pub last_move_at: DateTime<Utc>,
    pub started_at: DateTime<Utc>,
    pub finished_at: Option<DateTime<Utc>>,
}

#[derive(Debug, Clone, Serialize, FromRow)]
#[serde(rename_all = "camelCase")]
pub struct MoveRecord {
    pub id: Uuid,
    pub game_id: Uuid,
    pub move_number: i32,
    pub user_id: Uuid,
    pub uci: String,
    pub san: String,
    pub fen_after: String,
    pub created_at: DateTime<Utc>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RegisterRequest {
    pub username: String,
    pub email: String,
    pub password: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LoginRequest {
    pub email: String,
    pub password: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RefreshRequest {
    pub refresh_token: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateRoomRequest {
    pub visibility: Option<String>,
    pub rated: Option<bool>,
    pub time_control_seconds: Option<i32>,
    pub increment_seconds: Option<i32>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MatchmakingRequest {
    pub rated: Option<bool>,
    pub time_control_seconds: Option<i32>,
    pub increment_seconds: Option<i32>,
}

#[derive(Debug, Deserialize)]
pub struct TokenQuery {
    pub token: Option<String>,
}
