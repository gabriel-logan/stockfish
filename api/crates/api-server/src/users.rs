use actix_web::web;
use uuid::Uuid;

use crate::AppState;
use crate::auth::AuthUser;
use crate::error::{ApiError, ApiResult};
use crate::models::User;

pub async fn me(state: web::Data<AppState>, user: AuthUser) -> ApiResult<web::Json<User>> {
    let user = get_user(&state, user.id).await?;

    Ok(web::Json(user))
}

pub async fn create_user(
    state: &AppState,
    username: &str,
    email: &str,
    password_hash: &str,
) -> ApiResult<User> {
    sqlx::query_as::<_, User>(
        r#"
        INSERT INTO users (id, username, email, password_hash)
        VALUES ($1, $2, lower($3), $4)
        RETURNING id, username, email, rating, created_at
        "#,
    )
    .bind(Uuid::new_v4())
    .bind(username)
    .bind(email)
    .bind(password_hash)
    .fetch_one(&state.db)
    .await
    .map_err(map_unique_violation)
}

pub async fn get_user(state: &AppState, user_id: Uuid) -> ApiResult<User> {
    sqlx::query_as::<_, User>(
        "SELECT id, username, email, rating, created_at FROM users WHERE id = $1",
    )
    .bind(user_id)
    .fetch_optional(&state.db)
    .await?
    .ok_or_else(|| ApiError::NotFound("user not found".to_owned()))
}

fn map_unique_violation(error: sqlx::Error) -> ApiError {
    if let sqlx::Error::Database(db_error) = &error
        && db_error.is_unique_violation()
    {
        return ApiError::BadRequest("username or email already exists".to_owned());
    }

    ApiError::Database(error)
}
