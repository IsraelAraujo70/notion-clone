use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

use crate::application::auth::signup::AuthResponse as UseCaseAuthResponse;
use crate::domain::auth::User;
use crate::domain::workspace::{
    Workspace, WorkspaceInvite, WorkspaceInvitePreview, WorkspaceMember, WorkspaceMembership,
};

#[derive(Deserialize)]
pub struct SignupRequest {
    pub email: String,
    pub password: String,
    pub display_name: String,
}

#[derive(Deserialize)]
pub struct LoginRequest {
    pub email: String,
    pub password: String,
}

#[derive(Deserialize)]
pub struct RequestPasswordResetRequest {
    pub email: String,
}

#[derive(Deserialize)]
pub struct ResetPasswordRequest {
    pub token: String,
    pub password: String,
}

#[derive(Deserialize)]
pub struct ChangePasswordRequest {
    pub current_password: String,
    pub new_password: String,
}

#[derive(Deserialize)]
pub struct CreateWorkspaceRequest {
    pub name: String,
}

#[derive(Deserialize)]
pub struct InviteWorkspaceMemberRequest {
    pub email: String,
    pub role: String,
}

#[derive(Deserialize)]
pub struct UpdateWorkspaceMemberRoleRequest {
    pub role: String,
}

#[derive(Serialize)]
pub struct WorkspaceResponse {
    id: Uuid,
    name: String,
    role: String,
    created_at: DateTime<Utc>,
}

impl From<WorkspaceMembership> for WorkspaceResponse {
    fn from(workspace: WorkspaceMembership) -> Self {
        Self {
            id: workspace.id,
            name: workspace.name,
            role: workspace.role.as_str().to_string(),
            created_at: workspace.created_at,
        }
    }
}

#[derive(Serialize)]
pub struct WorkspaceMemberResponse {
    user_id: Uuid,
    email: String,
    display_name: String,
    role: String,
    joined_at: DateTime<Utc>,
}

impl From<WorkspaceMember> for WorkspaceMemberResponse {
    fn from(member: WorkspaceMember) -> Self {
        Self {
            user_id: member.user_id,
            email: member.email,
            display_name: member.display_name,
            role: member.role.as_str().to_string(),
            joined_at: member.joined_at,
        }
    }
}

#[derive(Serialize)]
pub struct WorkspaceInviteResponse {
    id: Uuid,
    workspace_id: Uuid,
    email: String,
    role: String,
    expires_at: DateTime<Utc>,
    created_at: DateTime<Utc>,
}

impl From<WorkspaceInvite> for WorkspaceInviteResponse {
    fn from(invite: WorkspaceInvite) -> Self {
        Self {
            id: invite.id,
            workspace_id: invite.workspace_id,
            email: invite.email,
            role: invite.role.as_str().to_string(),
            expires_at: invite.expires_at,
            created_at: invite.created_at,
        }
    }
}

#[derive(Serialize)]
pub struct WorkspaceInvitePreviewResponse {
    workspace_name: String,
    email: String,
    role: String,
    expires_at: DateTime<Utc>,
    status: String,
}

impl From<WorkspaceInvitePreview> for WorkspaceInvitePreviewResponse {
    fn from(preview: WorkspaceInvitePreview) -> Self {
        Self {
            workspace_name: preview.workspace_name,
            email: preview.email,
            role: preview.role.as_str().to_string(),
            expires_at: preview.expires_at,
            status: serde_json::to_value(preview.status)
                .ok()
                .and_then(|value| value.as_str().map(ToString::to_string))
                .unwrap_or_else(|| "pending".to_string()),
        }
    }
}

#[derive(Serialize)]
pub struct CreatedWorkspaceResponse {
    id: Uuid,
    name: String,
    created_at: DateTime<Utc>,
}

impl From<Workspace> for CreatedWorkspaceResponse {
    fn from(workspace: Workspace) -> Self {
        Self {
            id: workspace.id,
            name: workspace.name,
            created_at: workspace.created_at,
        }
    }
}

#[derive(Serialize)]
pub struct AuthResponse {
    user: User,
    token: String,
}

impl From<UseCaseAuthResponse> for AuthResponse {
    fn from(response: UseCaseAuthResponse) -> Self {
        Self {
            user: response.user,
            token: response.token,
        }
    }
}

#[derive(Serialize)]
pub struct AppSummaryResponse {
    product: &'static str,
    sections: Vec<AppSummarySection>,
}

#[derive(Serialize)]
pub struct AppSummarySection {
    id: &'static str,
    title: &'static str,
    description: &'static str,
}

impl AppSummaryResponse {
    pub fn starter() -> Self {
        Self {
            product: "MicroSaaS Starter",
            sections: vec![
                AppSummarySection {
                    id: "overview",
                    title: "Overview",
                    description: "Track the core workflow and product health.",
                },
                AppSummarySection {
                    id: "customers",
                    title: "Customers",
                    description: "Replace this placeholder with your customer surface.",
                },
                AppSummarySection {
                    id: "settings",
                    title: "Settings",
                    description: "Configure the product-specific runtime settings.",
                },
                AppSummarySection {
                    id: "activity",
                    title: "Activity",
                    description: "Expose recent business events and audit trails.",
                },
            ],
        }
    }
}
