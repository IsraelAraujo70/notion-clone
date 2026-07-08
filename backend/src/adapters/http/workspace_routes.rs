use axum::Json;
use axum::extract::{Path, State};
use axum::http::StatusCode;
use axum::response::IntoResponse;
use uuid::Uuid;

use crate::adapters::http::auth_extractor::AuthenticatedUser;
use crate::adapters::http::dto::{
    CreateWorkspaceRequest, CreatedWorkspaceResponse, InviteWorkspaceMemberRequest,
    UpdateWorkspaceMemberRoleRequest, WorkspaceInvitePreviewResponse, WorkspaceInviteResponse,
    WorkspaceMemberResponse, WorkspaceResponse,
};
use crate::adapters::http::error::HttpError;
use crate::application::workspaces::accept_invite::AcceptInviteInput;
use crate::application::workspaces::create_workspace::CreateWorkspaceInput;
use crate::application::workspaces::invite_member::InviteMemberInput;
use crate::bootstrap::state::AppState;

pub async fn list(
    State(state): State<AppState>,
    auth: AuthenticatedUser,
) -> Result<Json<Vec<WorkspaceResponse>>, HttpError> {
    let workspaces = state.list_workspaces.execute(auth.user.id).await?;
    Ok(Json(workspaces.into_iter().map(Into::into).collect()))
}

pub async fn create(
    State(state): State<AppState>,
    auth: AuthenticatedUser,
    Json(request): Json<CreateWorkspaceRequest>,
) -> Result<impl IntoResponse, HttpError> {
    let workspace = state
        .create_workspace
        .execute(CreateWorkspaceInput {
            owner_id: auth.user.id,
            name: request.name,
        })
        .await?;
    Ok((
        StatusCode::CREATED,
        Json(CreatedWorkspaceResponse::from(workspace)),
    ))
}

pub async fn list_members(
    State(state): State<AppState>,
    auth: AuthenticatedUser,
    Path(workspace_id): Path<Uuid>,
) -> Result<Json<Vec<WorkspaceMemberResponse>>, HttpError> {
    let members = state
        .list_members
        .execute(auth.user.id, workspace_id)
        .await?;
    Ok(Json(members.into_iter().map(Into::into).collect()))
}

pub async fn list_invites(
    State(state): State<AppState>,
    auth: AuthenticatedUser,
    Path(workspace_id): Path<Uuid>,
) -> Result<Json<Vec<WorkspaceInviteResponse>>, HttpError> {
    let invites = state
        .list_invites
        .execute(auth.user.id, workspace_id)
        .await?;
    Ok(Json(invites.into_iter().map(Into::into).collect()))
}

pub async fn invite_member(
    State(state): State<AppState>,
    auth: AuthenticatedUser,
    Path(workspace_id): Path<Uuid>,
    Json(request): Json<InviteWorkspaceMemberRequest>,
) -> Result<impl IntoResponse, HttpError> {
    let output = state
        .invite_member
        .execute(InviteMemberInput {
            actor_id: auth.user.id,
            actor_display_name: auth.user.display_name,
            workspace_id,
            email: request.email,
            role: request.role,
        })
        .await?;

    Ok((
        StatusCode::CREATED,
        Json(WorkspaceInviteResponse::from(output.invite)),
    ))
}

pub async fn revoke_invite(
    State(state): State<AppState>,
    auth: AuthenticatedUser,
    Path((workspace_id, invite_id)): Path<(Uuid, Uuid)>,
) -> Result<StatusCode, HttpError> {
    state
        .revoke_invite
        .execute(auth.user.id, workspace_id, invite_id)
        .await?;
    Ok(StatusCode::NO_CONTENT)
}

pub async fn update_member_role(
    State(state): State<AppState>,
    auth: AuthenticatedUser,
    Path((workspace_id, user_id)): Path<(Uuid, Uuid)>,
    Json(request): Json<UpdateWorkspaceMemberRoleRequest>,
) -> Result<StatusCode, HttpError> {
    state
        .update_member_role
        .execute(auth.user.id, workspace_id, user_id, request.role)
        .await?;
    Ok(StatusCode::NO_CONTENT)
}

pub async fn remove_member(
    State(state): State<AppState>,
    auth: AuthenticatedUser,
    Path((workspace_id, user_id)): Path<(Uuid, Uuid)>,
) -> Result<StatusCode, HttpError> {
    state
        .remove_member
        .execute(auth.user.id, workspace_id, user_id)
        .await?;
    Ok(StatusCode::NO_CONTENT)
}

pub async fn invite_preview(
    State(state): State<AppState>,
    Path(token): Path<String>,
) -> Result<Json<WorkspaceInvitePreviewResponse>, HttpError> {
    let preview = state.accept_invite.preview(&token).await?;
    Ok(Json(preview.into()))
}

pub async fn accept_invite(
    State(state): State<AppState>,
    auth: AuthenticatedUser,
    Path(token): Path<String>,
) -> Result<Json<WorkspaceResponse>, HttpError> {
    let membership = state
        .accept_invite
        .execute(AcceptInviteInput {
            token,
            user_id: auth.user.id,
            user_email: auth.user.email,
        })
        .await?;
    Ok(Json(membership.into()))
}
