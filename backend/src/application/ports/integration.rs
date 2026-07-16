use async_trait::async_trait;
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

use crate::application::ports::RepositoryError;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub enum IntegrationScope {
    #[serde(rename = "content:read")]
    ContentRead,
    #[serde(rename = "content:write")]
    ContentWrite,
    #[serde(rename = "search:read")]
    SearchRead,
    #[serde(rename = "media:read")]
    MediaRead,
}

impl IntegrationScope {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::ContentRead => "content:read",
            Self::ContentWrite => "content:write",
            Self::SearchRead => "search:read",
            Self::MediaRead => "media:read",
        }
    }

    pub fn parse(value: &str) -> Option<Self> {
        match value {
            "content:read" => Some(Self::ContentRead),
            "content:write" => Some(Self::ContentWrite),
            "search:read" => Some(Self::SearchRead),
            "media:read" => Some(Self::MediaRead),
            _ => None,
        }
    }
}

#[derive(Debug, Clone)]
pub struct CreateIntegrationTokenRecord {
    pub id: Uuid,
    pub user_id: Uuid,
    pub name: String,
    pub token_hash: String,
    pub scopes: Vec<IntegrationScope>,
    pub workspace_ids: Vec<Uuid>,
    pub expires_at: DateTime<Utc>,
    pub created_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Serialize)]
pub struct IntegrationToken {
    pub id: Uuid,
    pub name: String,
    pub scopes: Vec<IntegrationScope>,
    pub workspace_ids: Vec<Uuid>,
    pub expires_at: DateTime<Utc>,
    pub revoked_at: Option<DateTime<Utc>>,
    pub last_used_at: Option<DateTime<Utc>>,
    pub created_at: DateTime<Utc>,
}

#[derive(Debug, Clone)]
pub struct IntegrationPrincipal {
    pub token_id: Uuid,
    pub user_id: Uuid,
    pub scopes: Vec<IntegrationScope>,
    pub workspace_ids: Vec<Uuid>,
}

impl IntegrationPrincipal {
    pub fn permits(&self, scope: IntegrationScope, workspace_id: Uuid) -> bool {
        self.scopes.contains(&scope) && self.workspace_ids.contains(&workspace_id)
    }
}

#[async_trait]
pub trait IntegrationRepository: Send + Sync {
    async fn create_token(
        &self,
        input: CreateIntegrationTokenRecord,
    ) -> Result<IntegrationToken, RepositoryError>;

    async fn list_tokens(&self, user_id: Uuid) -> Result<Vec<IntegrationToken>, RepositoryError>;

    async fn revoke_token(
        &self,
        user_id: Uuid,
        token_id: Uuid,
        revoked_at: DateTime<Utc>,
    ) -> Result<bool, RepositoryError>;

    async fn find_principal_by_hash(
        &self,
        token_hash: &str,
        now: DateTime<Utc>,
    ) -> Result<Option<IntegrationPrincipal>, RepositoryError>;
}
