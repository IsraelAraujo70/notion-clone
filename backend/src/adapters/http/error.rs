use axum::Json;
use axum::http::StatusCode;
use axum::response::{IntoResponse, Response};
use serde_json::json;

use crate::application::AppError;
use crate::domain::error::DomainError;

pub struct HttpError(pub AppError);

impl From<AppError> for HttpError {
    fn from(error: AppError) -> Self {
        Self(error)
    }
}

impl IntoResponse for HttpError {
    fn into_response(self) -> Response {
        let (status, code, message) = match self.0 {
            AppError::Domain(DomainError::Validation(message)) => (
                StatusCode::UNPROCESSABLE_ENTITY,
                "validation_error",
                message,
            ),
            AppError::DuplicateEmail | AppError::Domain(DomainError::EmailTaken) => (
                StatusCode::CONFLICT,
                "email_taken",
                "An account with this email already exists",
            ),
            AppError::AlreadyMember | AppError::Domain(DomainError::AlreadyMember) => (
                StatusCode::CONFLICT,
                "already_member",
                "This user is already a workspace member",
            ),
            AppError::InvalidCredentials | AppError::Domain(DomainError::InvalidCredentials) => (
                StatusCode::UNAUTHORIZED,
                "invalid_credentials",
                "Invalid email or password",
            ),
            AppError::Unauthorized | AppError::Domain(DomainError::Unauthorized) => (
                StatusCode::UNAUTHORIZED,
                "unauthorized",
                "Missing or invalid session token",
            ),
            AppError::Forbidden | AppError::Domain(DomainError::Forbidden) => (
                StatusCode::FORBIDDEN,
                "forbidden",
                "You do not have permission to perform this action",
            ),
            AppError::Domain(DomainError::UserNotFound) => (
                StatusCode::NOT_FOUND,
                "user_not_found",
                "User was not found",
            ),
            AppError::Domain(DomainError::PageNotFound) => (
                StatusCode::NOT_FOUND,
                "page_not_found",
                "Page was not found",
            ),
            AppError::Email => (
                StatusCode::BAD_GATEWAY,
                "email_error",
                "Email delivery could not satisfy the request",
            ),
            AppError::StorageNotConfigured => (
                StatusCode::SERVICE_UNAVAILABLE,
                "storage_not_configured",
                "Object storage is not configured",
            ),
            AppError::Repository | AppError::Internal => (
                StatusCode::INTERNAL_SERVER_ERROR,
                "internal_error",
                "Something went wrong",
            ),
        };

        (status, Json(json!({"error": code, "message": message}))).into_response()
    }
}
