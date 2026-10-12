use axum::http::StatusCode;
use axum::response::{IntoResponse, Response};
use axum::Json;
use serde_json::json;

#[derive(Debug, thiserror::Error)]
pub enum AppError {
    #[error("unauthorized")]
    Unauthorized,
    #[error("forbidden")]
    Forbidden,
    #[error("not found")]
    NotFound,
    #[error("{0}")]
    BadRequest(String),
    #[error(transparent)]
    Database(#[from] sqlx::Error),
    #[error("upstream electric error: {0}")]
    Upstream(String),
    #[error("internal error: {0}")]
    Internal(String),
}

impl IntoResponse for AppError {
    fn into_response(self) -> Response {
        let status = match &self {
            AppError::Unauthorized => StatusCode::UNAUTHORIZED,
            AppError::Forbidden => StatusCode::FORBIDDEN,
            AppError::NotFound => StatusCode::NOT_FOUND,
            AppError::BadRequest(_) => StatusCode::BAD_REQUEST,
            AppError::Upstream(_) => StatusCode::BAD_GATEWAY,
            AppError::Database(e) => {
                tracing::error!(error = ?e, "database error");
                StatusCode::INTERNAL_SERVER_ERROR
            }
            AppError::Internal(e) => {
                tracing::error!(error = %e, "internal error");
                StatusCode::INTERNAL_SERVER_ERROR
            }
        };

        let message = match &self {
            AppError::Database(_) | AppError::Internal(_) => "internal server error".to_string(),
            other => other.to_string(),
        };

        (status, Json(json!({ "error": message }))).into_response()
    }
}

impl From<reqwest::Error> for AppError {
    fn from(value: reqwest::Error) -> Self {
        AppError::Upstream(value.to_string())
    }
}
