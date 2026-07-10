use axum::Json;
use axum::extract::{Path, Query, State};
use axum::http::StatusCode;
use serde::Deserialize;
use uuid::Uuid;

use crate::adapters::http::auth_extractor::AuthenticatedUser;
use crate::adapters::http::error::HttpError;
use crate::application::auth::update_profile::PresignAvatarResponse;
use crate::application::pages::presign_image::PresignPageImageInput;
use crate::application::ports::page::{
    OperationAck, OperationsPage, PageList, PageView, PermanentDeleteResult, SearchResult,
    TrashEntry,
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

#[derive(Debug, Deserialize)]
pub struct SearchQuery {
    pub q: String,
    pub limit: Option<i64>,
}

pub async fn search(
    State(state): State<AppState>,
    auth: AuthenticatedUser,
    Query(query): Query<SearchQuery>,
) -> Result<Json<Vec<SearchResult>>, HttpError> {
    Ok(Json(
        state
            .search_pages
            .execute(auth.user.id, query.q, query.limit)
            .await?,
    ))
}

pub async fn get_public_link(
    State(state): State<AppState>,
    auth: AuthenticatedUser,
    Path((workspace_id, page_id)): Path<(Uuid, Uuid)>,
) -> Result<Json<crate::application::pages::m4::PublicLinkResponse>, HttpError> {
    let link = state
        .public_links
        .get(auth.user.id, workspace_id, page_id)
        .await?
        .ok_or(crate::application::AppError::from(
            crate::domain::error::DomainError::PageNotFound,
        ))?;
    Ok(Json(link))
}

pub async fn create_public_link(
    State(state): State<AppState>,
    auth: AuthenticatedUser,
    Path((workspace_id, page_id)): Path<(Uuid, Uuid)>,
) -> Result<Json<crate::application::pages::m4::PublicLinkResponse>, HttpError> {
    Ok(Json(
        state
            .public_links
            .create(auth.user.id, workspace_id, page_id)
            .await?,
    ))
}

pub async fn revoke_public_link(
    State(state): State<AppState>,
    auth: AuthenticatedUser,
    Path((workspace_id, page_id)): Path<(Uuid, Uuid)>,
) -> Result<StatusCode, HttpError> {
    state
        .public_links
        .revoke(auth.user.id, workspace_id, page_id)
        .await?;
    Ok(StatusCode::NO_CONTENT)
}

pub async fn get_public_page(
    State(state): State<AppState>,
    Path(token): Path<String>,
) -> Result<Json<crate::application::pages::m4::PublicPageResponse>, HttpError> {
    let token = Uuid::parse_str(&token).map_err(|_| {
        crate::application::AppError::from(crate::domain::error::DomainError::PageNotFound)
    })?;
    Ok(Json(state.public_links.public_page(token).await?))
}

pub async fn permanently_delete(
    State(state): State<AppState>,
    auth: AuthenticatedUser,
    Path((workspace_id, block_id)): Path<(Uuid, Uuid)>,
) -> Result<(StatusCode, Json<PermanentDeleteResult>), HttpError> {
    let result = state
        .permanently_delete
        .execute(auth.user.id, workspace_id, block_id)
        .await?;
    Ok((StatusCode::ACCEPTED, Json(result)))
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
