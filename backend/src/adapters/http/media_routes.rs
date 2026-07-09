use axum::extract::{Path, State};
use axum::response::Redirect;

use crate::application::AppError;
use crate::application::ports::StorageError;
use crate::bootstrap::state::AppState;

use super::error::HttpError;

pub async fn get_media(
    State(state): State<AppState>,
    Path(key): Path<String>,
) -> Result<Redirect, HttpError> {
    let url = state
        .storage
        .presign_get(&key)
        .await
        .map_err(|error| match error {
            StorageError::NotConfigured => AppError::StorageNotConfigured,
            StorageError::InvalidContentType | StorageError::Unexpected => AppError::Internal,
        })?;

    Ok(Redirect::temporary(&url))
}
