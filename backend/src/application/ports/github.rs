use async_trait::async_trait;
use chrono::{DateTime, Utc};
use serde::Serialize;
use uuid::Uuid;

use crate::application::ports::RepositoryError;
use crate::domain::github::GitHubPullRequestRef;

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum GitHubGatewayError {
    Unauthorized,
    NotFound,
    Unexpected,
}

#[derive(Debug, Clone)]
pub struct CreateInstallationState {
    pub id: Uuid,
    pub workspace_id: Uuid,
    pub initiated_by: Uuid,
    pub return_page_id: Uuid,
    pub state_hash: String,
    pub expires_at: DateTime<Utc>,
    pub created_at: DateTime<Utc>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct PendingGitHubInstallation {
    pub workspace_id: Uuid,
    pub initiated_by: Uuid,
    pub installation_id: i64,
    pub return_page_id: Uuid,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
pub struct GitHubInstallation {
    pub id: Uuid,
    pub workspace_id: Uuid,
    pub installation_id: i64,
    pub account_login: String,
    pub account_type: String,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
pub struct GitHubIntegrationStatus {
    pub configured: bool,
    pub installations: Vec<GitHubInstallation>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct GitHubInstallationSnapshot {
    pub installation_id: i64,
    pub account_login: String,
    pub account_type: String,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct GitHubPullRequestSnapshot {
    pub url: String,
    pub title: String,
    pub body: Option<String>,
    pub state: String,
    pub draft: bool,
    pub author_login: Option<String>,
    pub head_sha: String,
    pub base_ref: String,
    pub head_ref: String,
    pub additions: i64,
    pub deletions: i64,
    pub changed_files: i64,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
pub struct GitHubPullRequestFile {
    pub path: String,
    pub previous_filename: Option<String>,
    pub status: String,
    pub additions: i64,
    pub deletions: i64,
    pub changes: i64,
    pub patch: Option<String>,
    pub blob_url: String,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
pub struct GitHubPullRequestFiles {
    pub files: Vec<GitHubPullRequestFile>,
    pub total_changed_files: i64,
    pub truncated: bool,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct GitHubPullRequestFileBatch {
    pub files: Vec<GitHubPullRequestFile>,
    pub limit_reached: bool,
}

#[derive(Debug, Clone)]
pub struct SavePullRequestLink {
    pub id: Uuid,
    pub workspace_id: Uuid,
    pub block_id: Uuid,
    pub pull_request: GitHubPullRequestRef,
    pub snapshot: GitHubPullRequestSnapshot,
    pub linked_by: Uuid,
    pub now: DateTime<Utc>,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
pub struct GitHubPullRequestLink {
    pub id: Uuid,
    pub workspace_id: Uuid,
    pub block_id: Uuid,
    pub owner: String,
    pub repository: String,
    pub pull_number: i64,
    pub url: String,
    pub title: String,
    pub body: Option<String>,
    pub state: String,
    pub draft: bool,
    pub author_login: Option<String>,
    pub head_sha: String,
    pub base_ref: String,
    pub head_ref: String,
    pub additions: i64,
    pub deletions: i64,
    pub changed_files: i64,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct GitHubPullRequestLinkContext {
    pub link: GitHubPullRequestLink,
    pub installation_id: i64,
}

#[async_trait]
pub trait GitHubGateway: Send + Sync {
    fn installation_url(&self, state: &str) -> String;

    fn oauth_authorization_url(&self, state: &str) -> String;

    async fn exchange_oauth_code(&self, code: &str) -> Result<String, GitHubGatewayError>;

    async fn user_has_installation_access(
        &self,
        user_token: &str,
        installation_id: i64,
    ) -> Result<bool, GitHubGatewayError>;

    async fn get_installation(
        &self,
        installation_id: i64,
        now: DateTime<Utc>,
    ) -> Result<GitHubInstallationSnapshot, GitHubGatewayError>;

    async fn get_pull_request(
        &self,
        installation_id: i64,
        pull_request: &GitHubPullRequestRef,
        now: DateTime<Utc>,
    ) -> Result<GitHubPullRequestSnapshot, GitHubGatewayError>;

    async fn list_pull_request_files(
        &self,
        installation_id: i64,
        pull_request: &GitHubPullRequestRef,
        now: DateTime<Utc>,
    ) -> Result<GitHubPullRequestFileBatch, GitHubGatewayError>;
}

#[async_trait]
pub trait GitHubRepository: Send + Sync {
    async fn create_installation_state(
        &self,
        input: CreateInstallationState,
    ) -> Result<(), RepositoryError>;

    async fn exchange_setup_state(
        &self,
        state_hash: &str,
        installation_id: i64,
        oauth_state_id: Uuid,
        oauth_state_hash: &str,
        expires_at: DateTime<Utc>,
        now: DateTime<Utc>,
    ) -> Result<bool, RepositoryError>;

    async fn consume_oauth_state(
        &self,
        state_hash: &str,
        now: DateTime<Utc>,
    ) -> Result<Option<PendingGitHubInstallation>, RepositoryError>;

    async fn save_installation(
        &self,
        pending: PendingGitHubInstallation,
        installation: GitHubInstallationSnapshot,
        now: DateTime<Utc>,
    ) -> Result<GitHubInstallation, RepositoryError>;

    async fn list_installations(
        &self,
        workspace_id: Uuid,
    ) -> Result<Vec<GitHubInstallation>, RepositoryError>;

    async fn find_installation(
        &self,
        workspace_id: Uuid,
    ) -> Result<Option<GitHubInstallation>, RepositoryError>;

    async fn validate_pull_request_link_target(
        &self,
        workspace_id: Uuid,
        block_id: Uuid,
    ) -> Result<(), RepositoryError>;

    async fn save_pull_request_link(
        &self,
        input: SavePullRequestLink,
    ) -> Result<GitHubPullRequestLink, RepositoryError>;

    async fn list_pull_request_links(
        &self,
        workspace_id: Uuid,
    ) -> Result<Vec<GitHubPullRequestLink>, RepositoryError>;

    async fn find_pull_request_link(
        &self,
        workspace_id: Uuid,
        block_id: Uuid,
    ) -> Result<Option<GitHubPullRequestLinkContext>, RepositoryError>;

    async fn delete_pull_request_link(
        &self,
        workspace_id: Uuid,
        block_id: Uuid,
    ) -> Result<(), RepositoryError>;
}
