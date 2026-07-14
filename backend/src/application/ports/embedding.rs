use std::time::Duration;

use async_trait::async_trait;
use chrono::{DateTime, Utc};
use serde::Serialize;
use uuid::Uuid;

use crate::application::ports::RepositoryError;
use crate::domain::block::BlockType;

#[derive(Debug, Clone)]
pub struct EmbeddingJob {
    pub workspace_id: Uuid,
    pub block_id: Uuid,
    pub model: String,
    pub dimensions: usize,
    pub content: String,
    pub content_hash: Vec<u8>,
    pub attempts: i32,
    pub lease_token: Uuid,
    pub leased_until: DateTime<Utc>,
    pub created_at: DateTime<Utc>,
}

impl EmbeddingJob {
    pub fn lease_is_valid_at(&self, now: DateTime<Utc>) -> bool {
        self.leased_until > now
    }
}

#[async_trait]
pub trait EmbeddingJobRepository: Send + Sync {
    async fn claim(
        &self,
        limit: i64,
        lease_for: Duration,
    ) -> Result<Vec<EmbeddingJob>, RepositoryError>;
    async fn complete(
        &self,
        job: &EmbeddingJob,
        embedding: &[f32],
    ) -> Result<bool, RepositoryError>;
    async fn retry(&self, job: &EmbeddingJob, error: &str) -> Result<bool, RepositoryError>;
}

#[derive(Debug, Clone, Serialize, PartialEq)]
pub struct SemanticSearchResult {
    pub workspace_id: Uuid,
    pub workspace_name: String,
    pub page_id: Uuid,
    pub page_title: String,
    pub page_icon: String,
    pub block_id: Uuid,
    pub block_type: BlockType,
    pub text: String,
    pub score: f32,
}

#[async_trait]
pub trait SemanticEmbeddingRepository: Send + Sync {
    async fn search(
        &self,
        user_id: Uuid,
        workspace_id: Uuid,
        model: &str,
        query_embedding: &[f32],
        limit: i64,
    ) -> Result<Vec<SemanticSearchResult>, RepositoryError>;
}

#[cfg(test)]
mod tests {
    use super::*;
    use chrono::TimeDelta;

    #[test]
    fn lease_is_valid_only_before_its_deadline() {
        let now = Utc::now();
        let mut job = EmbeddingJob {
            workspace_id: Uuid::nil(),
            block_id: Uuid::nil(),
            model: "model".into(),
            dimensions: 3072,
            content: "content".into(),
            content_hash: vec![0; 32],
            attempts: 0,
            lease_token: Uuid::nil(),
            leased_until: now + TimeDelta::seconds(1),
            created_at: now,
        };

        assert!(job.lease_is_valid_at(now));
        job.leased_until = now;
        assert!(!job.lease_is_valid_at(now));
    }
}
