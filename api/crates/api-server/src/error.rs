use actix_web::http::StatusCode;
use actix_web::{HttpResponse, ResponseError};
use serde::Serialize;
use thiserror::Error;

#[derive(Debug, Error)]
pub enum ApiError {
    #[error("authentication required")]
    Unauthorized,
    #[error("forbidden")]
    Forbidden,
    #[error("{0}")]
    BadRequest(String),
    #[error("{0}")]
    NotFound(String),
    #[error("database error")]
    Database(#[from] sqlx::Error),
    #[error("internal server error")]
    Internal,
}

#[derive(Serialize)]
struct ErrorBody {
    error: String,
}

impl ResponseError for ApiError {
    fn status_code(&self) -> StatusCode {
        match self {
            Self::Unauthorized => StatusCode::UNAUTHORIZED,
            Self::Forbidden => StatusCode::FORBIDDEN,
            Self::BadRequest(_) => StatusCode::BAD_REQUEST,
            Self::NotFound(_) => StatusCode::NOT_FOUND,
            Self::Database(_) | Self::Internal => StatusCode::INTERNAL_SERVER_ERROR,
        }
    }

    fn error_response(&self) -> HttpResponse {
        let status = self.status_code();

        if status.is_server_error() {
            tracing::error!(error = %self, status = status.as_u16(), "api request failed");
        } else {
            tracing::warn!(error = %self, status = status.as_u16(), "api request failed");
        }

        HttpResponse::build(status).json(ErrorBody {
            error: self.to_string(),
        })
    }
}

pub type ApiResult<T> = Result<T, ApiError>;
