use axum::Json;
use axum::extract::{Path, State};
use uuid::Uuid;

use crate::adapters::http::auth_extractor::AuthenticatedUser;
use crate::adapters::http::error::HttpError;
use crate::application::ports::page::{OperationAck, PageList, PageView, TrashEntry};
use crate::bootstrap::state::AppState;
use crate::domain::block::Operation;

pub async fn list_pages(
    State(state): State<AppState>,
    auth: AuthenticatedUser,
    Path(workspace_id): Path<Uuid>,
) -> Result<Json<PageList>, HttpError> {
    let pages = state.list_pages.execute(auth.user.id, workspace_id).await?;
    Ok(Json(pages))
}

pub async fn get_page(
    State(state): State<AppState>,
    auth: AuthenticatedUser,
    Path((workspace_id, page_id)): Path<(Uuid, Uuid)>,
) -> Result<Json<PageView>, HttpError> {
    let page = state
        .get_page
        .execute(auth.user.id, workspace_id, page_id)
        .await?;
    Ok(Json(page))
}

pub async fn apply_operation(
    State(state): State<AppState>,
    auth: AuthenticatedUser,
    Path(workspace_id): Path<Uuid>,
    Json(operation): Json<Operation>,
) -> Result<Json<OperationAck>, HttpError> {
    let ack = state
        .apply_operation
        .execute(auth.user.id, workspace_id, operation)
        .await?;
    Ok(Json(ack))
}

pub async fn list_trash(
    State(state): State<AppState>,
    auth: AuthenticatedUser,
    Path(workspace_id): Path<Uuid>,
) -> Result<Json<Vec<TrashEntry>>, HttpError> {
    let entries = state.list_trash.execute(auth.user.id, workspace_id).await?;
    Ok(Json(entries))
}
