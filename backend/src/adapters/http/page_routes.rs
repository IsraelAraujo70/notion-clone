use axum::Json;
use axum::extract::{Path, Query, State};
use serde::Deserialize;
use uuid::Uuid;

use crate::adapters::http::auth_extractor::AuthenticatedUser;
use crate::adapters::http::error::HttpError;
use crate::application::auth::update_profile::PresignAvatarResponse;
use crate::application::pages::presign_image::PresignPageImageInput;
use crate::application::ports::page::{
    OperationAck, OperationsPage, PageList, PageView, TrashEntry,
};
use crate::bootstrap::state::AppState;
use crate::domain::block::Operation;

#[derive(Debug, Deserialize)]
pub struct PresignImageRequest {
    pub content_type: String,
}

#[derive(Debug, Deserialize)]
pub struct ListOperationsQuery {
    pub after_seq: Option<i64>,
    pub limit: Option<i64>,
    pub up_to_seq: Option<i64>,
}

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
    let mut page = state
        .get_page
        .execute(auth.user.id, workspace_id, page_id)
        .await?;
    for editor in &mut page.recent_editors {
        editor.avatar_url = editor
            .avatar_key
            .as_deref()
            .and_then(|key| state.storage.public_url(key));
    }
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

pub async fn list_operations(
    State(state): State<AppState>,
    auth: AuthenticatedUser,
    Path(workspace_id): Path<Uuid>,
    Query(query): Query<ListOperationsQuery>,
) -> Result<Json<OperationsPage>, HttpError> {
    let page = state
        .list_operations
        .execute(
            auth.user.id,
            workspace_id,
            query.after_seq.unwrap_or(0),
            query.limit,
            query.up_to_seq,
        )
        .await?;
    Ok(Json(page))
}

pub async fn list_trash(
    State(state): State<AppState>,
    auth: AuthenticatedUser,
    Path(workspace_id): Path<Uuid>,
) -> Result<Json<Vec<TrashEntry>>, HttpError> {
    let entries = state.list_trash.execute(auth.user.id, workspace_id).await?;
    Ok(Json(entries))
}

pub async fn presign_image(
    State(state): State<AppState>,
    auth: AuthenticatedUser,
    Path(workspace_id): Path<Uuid>,
    Json(request): Json<PresignImageRequest>,
) -> Result<Json<PresignAvatarResponse>, HttpError> {
    let response = state
        .presign_page_image
        .execute(PresignPageImageInput {
            user_id: auth.user.id,
            workspace_id,
            content_type: request.content_type,
        })
        .await?;
    Ok(Json(response))
}
