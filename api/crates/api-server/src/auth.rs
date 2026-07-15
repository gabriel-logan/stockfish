use actix_web::dev::Payload;
use actix_web::{FromRequest, HttpRequest, web};
use argon2::password_hash::{SaltString, rand_core::OsRng};
use argon2::{Argon2, PasswordHash, PasswordHasher, PasswordVerifier};
use chrono::{DateTime, Duration, Utc};
use futures_util::future::{Ready, ready};
use jsonwebtoken::{DecodingKey, EncodingKey, Header, Validation, decode, encode};
use rand::RngCore;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use sqlx::FromRow;
use uuid::Uuid;

use crate::AppState;
use crate::error::{ApiError, ApiResult};
use crate::models::{LoginRequest, RefreshRequest, RegisterRequest, User};
use crate::users;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Claims {
    pub sub: Uuid,
    pub exp: usize,
    pub token_type: String,
}

#[derive(Debug, Clone)]
pub struct AuthUser {
    pub id: Uuid,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AuthResponse {
    pub user: User,
    pub access_token: String,
    pub refresh_token: String,
}

#[derive(FromRow)]
struct LoginUser {
    id: Uuid,
    username: String,
    email: String,
    password_hash: String,
    rating: i32,
    created_at: DateTime<Utc>,
}

impl FromRequest for AuthUser {
    type Error = ApiError;
    type Future = Ready<Result<Self, Self::Error>>;

    fn from_request(req: &HttpRequest, _: &mut Payload) -> Self::Future {
        let Some(state) = req.app_data::<web::Data<AppState>>() else {
            return ready(Err(ApiError::Internal));
        };

        let Some(value) = req.headers().get("authorization") else {
            return ready(Err(ApiError::Unauthorized));
        };

        let Ok(header) = value.to_str() else {
            return ready(Err(ApiError::Unauthorized));
        };

        let Some(token) = header.strip_prefix("Bearer ") else {
            return ready(Err(ApiError::Unauthorized));
        };

        match decode_access_token(token, &state.config.jwt_secret) {
            Ok(user_id) => ready(Ok(AuthUser { id: user_id })),
            Err(_) => ready(Err(ApiError::Unauthorized)),
        }
    }
}

pub async fn register(
    state: web::Data<AppState>,
    body: web::Json<RegisterRequest>,
) -> ApiResult<web::Json<AuthResponse>> {
    validate_username(&body.username)?;
    validate_password(&body.password)?;

    let password_hash = hash_password(&body.password)?;
    let user = users::create_user(
        &state,
        body.username.trim(),
        body.email.trim(),
        &password_hash,
    )
    .await?;

    issue_auth_response(&state, user).await.map(web::Json)
}

pub async fn login(
    state: web::Data<AppState>,
    body: web::Json<LoginRequest>,
) -> ApiResult<web::Json<AuthResponse>> {
    let row = sqlx::query_as::<_, LoginUser>(
        r#"
        SELECT id, username, email, password_hash, rating, created_at
        FROM users
        WHERE email = lower($1)
        "#,
    )
    .bind(body.email.trim())
    .fetch_optional(&state.db)
    .await?;

    let Some(LoginUser {
        id,
        username,
        email,
        password_hash,
        rating,
        created_at,
    }) = row
    else {
        return Err(ApiError::Unauthorized);
    };

    verify_password(&body.password, &password_hash)?;

    let user = User {
        id,
        username,
        email,
        rating,
        created_at,
    };

    issue_auth_response(&state, user).await.map(web::Json)
}

pub async fn refresh(
    state: web::Data<AppState>,
    body: web::Json<RefreshRequest>,
) -> ApiResult<web::Json<AuthResponse>> {
    let token_hash = hash_refresh_token(&body.refresh_token);

    let user = sqlx::query_as::<_, User>(
        r#"
        SELECT users.id, users.username, users.email, users.rating, users.created_at
        FROM refresh_tokens
        JOIN users ON users.id = refresh_tokens.user_id
        WHERE refresh_tokens.token_hash = $1
            AND refresh_tokens.revoked_at IS NULL
            AND refresh_tokens.expires_at > now()
        "#,
    )
    .bind(&token_hash)
    .fetch_optional(&state.db)
    .await?
    .ok_or(ApiError::Unauthorized)?;

    sqlx::query("UPDATE refresh_tokens SET revoked_at = now() WHERE token_hash = $1")
        .bind(&token_hash)
        .execute(&state.db)
        .await?;

    issue_auth_response(&state, user).await.map(web::Json)
}

pub async fn logout(
    state: web::Data<AppState>,
    body: web::Json<RefreshRequest>,
) -> ApiResult<web::Json<serde_json::Value>> {
    sqlx::query("UPDATE refresh_tokens SET revoked_at = now() WHERE token_hash = $1")
        .bind(hash_refresh_token(&body.refresh_token))
        .execute(&state.db)
        .await?;

    Ok(web::Json(serde_json::json!({ "ok": true })))
}

pub fn decode_access_token(token: &str, secret: &str) -> ApiResult<Uuid> {
    let claims = decode::<Claims>(
        token,
        &DecodingKey::from_secret(secret.as_bytes()),
        &Validation::default(),
    )
    .map_err(|_| ApiError::Unauthorized)?
    .claims;

    if claims.token_type != "access" {
        return Err(ApiError::Unauthorized);
    }

    Ok(claims.sub)
}

async fn issue_auth_response(state: &AppState, user: User) -> ApiResult<AuthResponse> {
    let access_token = create_jwt(
        user.id,
        "access",
        state.config.access_token_ttl_seconds,
        &state.config.jwt_secret,
    )?;
    let refresh_token = create_refresh_token();
    let expires_at = Utc::now() + Duration::seconds(state.config.refresh_token_ttl_seconds);

    sqlx::query(
        r#"
        INSERT INTO refresh_tokens (id, user_id, token_hash, expires_at)
        VALUES ($1, $2, $3, $4)
        "#,
    )
    .bind(Uuid::new_v4())
    .bind(user.id)
    .bind(hash_refresh_token(&refresh_token))
    .bind(expires_at)
    .execute(&state.db)
    .await?;

    Ok(AuthResponse {
        user,
        access_token,
        refresh_token,
    })
}

fn create_jwt(
    user_id: Uuid,
    token_type: &str,
    ttl_seconds: i64,
    secret: &str,
) -> ApiResult<String> {
    let exp = (Utc::now() + Duration::seconds(ttl_seconds)).timestamp() as usize;
    let claims = Claims {
        sub: user_id,
        exp,
        token_type: token_type.to_owned(),
    };

    encode(
        &Header::default(),
        &claims,
        &EncodingKey::from_secret(secret.as_bytes()),
    )
    .map_err(|_| ApiError::Internal)
}

fn create_refresh_token() -> String {
    let mut bytes = [0_u8; 32];
    rand::thread_rng().fill_bytes(&mut bytes);

    bytes.iter().map(|byte| format!("{byte:02x}")).collect()
}

fn hash_refresh_token(token: &str) -> String {
    let digest = Sha256::digest(token.as_bytes());

    digest.iter().map(|byte| format!("{byte:02x}")).collect()
}

fn hash_password(password: &str) -> ApiResult<String> {
    let salt = SaltString::generate(&mut OsRng);

    Argon2::default()
        .hash_password(password.as_bytes(), &salt)
        .map(|hash| hash.to_string())
        .map_err(|_| ApiError::Internal)
}

fn verify_password(password: &str, password_hash: &str) -> ApiResult<()> {
    let parsed_hash = PasswordHash::new(password_hash).map_err(|_| ApiError::Unauthorized)?;

    Argon2::default()
        .verify_password(password.as_bytes(), &parsed_hash)
        .map_err(|_| ApiError::Unauthorized)
}

fn validate_username(username: &str) -> ApiResult<()> {
    let username = username.trim();

    if username.len() < 3 || username.len() > 32 {
        return Err(ApiError::BadRequest(
            "username must be between 3 and 32 characters".to_owned(),
        ));
    }

    Ok(())
}

fn validate_password(password: &str) -> ApiResult<()> {
    if password.len() < 8 {
        return Err(ApiError::BadRequest(
            "password must be at least 8 characters".to_owned(),
        ));
    }

    Ok(())
}
