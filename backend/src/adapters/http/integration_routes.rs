use axum::Json;
use axum::extract::{Path, State};
use axum::http::StatusCode;
use uuid::Uuid;

use crate::adapters::http::auth_extractor::AuthenticatedUser;
use crate::adapters::http::error::HttpError;
use crate::application::integrations::{CreateIntegrationTokenInput, CreatedIntegrationToken};
use crate::application::ports::integration::IntegrationToken;
use crate::bootstrap::state::AppState;

pub async fn create_token(
    State(state): State<AppState>,
    auth: AuthenticatedUser,
    Json(input): Json<CreateIntegrationTokenInput>,
) -> Result<(StatusCode, Json<CreatedIntegrationToken>), HttpError> {
    let token = state.integrations.create(auth.user.id, input).await?;
    Ok((StatusCode::CREATED, Json(token)))
}

pub async fn list_tokens(
    State(state): State<AppState>,
    auth: AuthenticatedUser,
) -> Result<Json<Vec<IntegrationToken>>, HttpError> {
    Ok(Json(state.integrations.list(auth.user.id).await?))
}

pub async fn revoke_token(
    State(state): State<AppState>,
    auth: AuthenticatedUser,
    Path(token_id): Path<Uuid>,
) -> Result<StatusCode, HttpError> {
    state.integrations.revoke(auth.user.id, token_id).await?;
    Ok(StatusCode::NO_CONTENT)
}
