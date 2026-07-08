use chrono::{DateTime, Utc};
use serde::Serialize;
use uuid::Uuid;

use crate::domain::error::DomainError;

const WORKSPACE_NAME_ERROR: &str = "Workspace name must be between 1 and 100 characters";
const WORKSPACE_ROLE_ERROR: &str = "Workspace role must be owner, editor, or viewer";

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
pub struct Workspace {
    pub id: Uuid,
    pub name: String,
    pub created_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Copy, Serialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum WorkspaceRole {
    Owner,
    Editor,
    Viewer,
}

impl WorkspaceRole {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::Owner => "owner",
            Self::Editor => "editor",
            Self::Viewer => "viewer",
        }
    }

    pub fn can_manage_workspace(self) -> bool {
        matches!(self, Self::Owner)
    }

    pub fn can_write_content(self) -> bool {
        matches!(self, Self::Owner | Self::Editor)
    }
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
pub struct WorkspaceMembership {
    pub id: Uuid,
    pub name: String,
    pub role: WorkspaceRole,
    pub created_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
pub struct WorkspaceMember {
    pub user_id: Uuid,
    pub email: String,
    pub display_name: String,
    pub role: WorkspaceRole,
    pub joined_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
pub struct WorkspaceInvite {
    pub id: Uuid,
    pub workspace_id: Uuid,
    pub email: String,
    pub role: WorkspaceRole,
    pub invited_by: Uuid,
    pub created_at: DateTime<Utc>,
    pub expires_at: DateTime<Utc>,
    pub accepted_at: Option<DateTime<Utc>>,
    pub revoked_at: Option<DateTime<Utc>>,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum WorkspaceInviteStatus {
    Pending,
    Accepted,
    Expired,
    Revoked,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
pub struct WorkspaceInvitePreview {
    pub workspace_name: String,
    pub email: String,
    pub role: WorkspaceRole,
    pub expires_at: DateTime<Utc>,
    pub status: WorkspaceInviteStatus,
}

pub fn validate_workspace_name(name: &str) -> Result<String, DomainError> {
    let trimmed = name.trim();
    if trimmed.is_empty() || trimmed.chars().count() > 100 {
        return Err(DomainError::Validation(WORKSPACE_NAME_ERROR));
    }
    Ok(trimmed.to_string())
}

pub fn validate_workspace_role(role: &str) -> Result<WorkspaceRole, DomainError> {
    match role.trim().to_lowercase().as_str() {
        "owner" => Ok(WorkspaceRole::Owner),
        "editor" => Ok(WorkspaceRole::Editor),
        "viewer" => Ok(WorkspaceRole::Viewer),
        _ => Err(DomainError::Validation(WORKSPACE_ROLE_ERROR)),
    }
}
