use std::collections::HashSet;
use std::sync::Arc;

use chrono::Duration;
use serde::{Deserialize, Serialize};
use uuid::Uuid;

use crate::application::AppError;
use crate::application::ports::clock::Clock;
use crate::application::ports::integration::{
    CreateIntegrationTokenRecord, IntegrationPrincipal, IntegrationRepository, IntegrationScope,
    IntegrationToken,
};
use crate::application::ports::workspace::WorkspaceRepository;
use crate::domain::auth::session::{generate_token, hash_token};
use crate::domain::error::DomainError;

const TOKEN_PREFIX: &str = "rsn_mcp_";

#[derive(Debug, Clone, Deserialize)]
pub struct CreateIntegrationTokenInput {
    pub name: String,
    pub scopes: Vec<IntegrationScope>,
    pub workspace_ids: Vec<Uuid>,
    pub expires_in_days: Option<i64>,
}

#[derive(Debug, Clone, Serialize)]
pub struct CreatedIntegrationToken {
    pub token: String,
    pub integration: IntegrationToken,
}

#[derive(Clone)]
pub struct IntegrationUseCases {
    repository: Arc<dyn IntegrationRepository>,
    workspaces: Arc<dyn WorkspaceRepository>,
    clock: Arc<dyn Clock>,
}

impl IntegrationUseCases {
    pub fn new(
        repository: Arc<dyn IntegrationRepository>,
        workspaces: Arc<dyn WorkspaceRepository>,
        clock: Arc<dyn Clock>,
    ) -> Self {
        Self {
            repository,
            workspaces,
            clock,
        }
    }

    pub async fn create(
        &self,
        user_id: Uuid,
        input: CreateIntegrationTokenInput,
    ) -> Result<CreatedIntegrationToken, AppError> {
        let name = input.name.trim();
        if name.is_empty() || name.chars().count() > 100 {
            return Err(DomainError::Validation(
                "Integration name must contain 1 to 100 characters",
            )
            .into());
        }
        let scopes = input.scopes.into_iter().collect::<HashSet<_>>();
        if scopes.is_empty() {
            return Err(
                DomainError::Validation("At least one integration scope is required").into(),
            );
        }
        let workspace_ids = input.workspace_ids.into_iter().collect::<HashSet<_>>();
        if workspace_ids.is_empty() || workspace_ids.len() > 50 {
            return Err(DomainError::Validation(
                "Integration must grant between 1 and 50 workspaces",
            )
            .into());
        }
        let memberships = self.workspaces.list_for_user(user_id).await?;
        if !workspace_ids
            .iter()
            .all(|id| memberships.iter().any(|membership| membership.id == *id))
        {
            return Err(AppError::Forbidden);
        }
        let expires_in_days = input.expires_in_days.unwrap_or(30);
        if !(1..=365).contains(&expires_in_days) {
            return Err(DomainError::Validation(
                "Integration expiration must be between 1 and 365 days",
            )
            .into());
        }

        let now = self.clock.now();
        let token = format!("{TOKEN_PREFIX}{}", generate_token());
        let integration = self
            .repository
            .create_token(CreateIntegrationTokenRecord {
                id: Uuid::new_v4(),
                user_id,
                name: name.to_string(),
                token_hash: hash_token(&token),
                scopes: scopes.into_iter().collect(),
                workspace_ids: workspace_ids.into_iter().collect(),
                expires_at: now + Duration::days(expires_in_days),
                created_at: now,
            })
            .await?;
        Ok(CreatedIntegrationToken { token, integration })
    }

    pub async fn list(&self, user_id: Uuid) -> Result<Vec<IntegrationToken>, AppError> {
        self.repository
            .list_tokens(user_id)
            .await
            .map_err(Into::into)
    }

    pub async fn revoke(&self, user_id: Uuid, token_id: Uuid) -> Result<(), AppError> {
        if self
            .repository
            .revoke_token(user_id, token_id, self.clock.now())
            .await?
        {
            Ok(())
        } else {
            Err(AppError::Forbidden)
        }
    }

    pub async fn authenticate(&self, token: &str) -> Result<IntegrationPrincipal, AppError> {
        if !token.starts_with(TOKEN_PREFIX) {
            return Err(AppError::Unauthorized);
        }
        self.repository
            .find_principal_by_hash(&hash_token(token), self.clock.now())
            .await?
            .ok_or(AppError::Unauthorized)
    }
}
