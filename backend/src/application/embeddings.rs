use std::sync::Arc;

use async_trait::async_trait;
use sha2::{Digest, Sha256};
use uuid::Uuid;

use crate::application::AppError;
use crate::application::ports::RepositoryError;
use crate::application::ports::ai::{
    AiProvider, AiProviderError, SemanticCandidate, SemanticSearch,
};
use crate::application::ports::embedding::{SemanticEmbeddingRepository, SemanticSearchResult};
use crate::domain::block::{Block, BlockType};
use crate::domain::error::DomainError;

pub const DEFAULT_EMBEDDING_MODEL: &str = "openai/text-embedding-3-large";
pub const EMBEDDING_DIMENSIONS: usize = 3072;
pub const MAX_HALF_VECTOR_VALUE: f32 = 65_504.0;
pub const DEFAULT_SEMANTIC_SEARCH_LIMIT: i64 = 10;
pub const MAX_SEMANTIC_SEARCH_LIMIT: i64 = 50;

pub fn canonical_block_text(block: &Block) -> Option<String> {
    if block.block_type == BlockType::Divider {
        return None;
    }
    let text = ["title", "text", "caption"]
        .iter()
        .filter_map(|key| block.properties.get(*key)?.as_str())
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .collect::<Vec<_>>()
        .join("\n");
    (!text.is_empty()).then_some(text)
}

pub fn content_hash(model: &str, content: &str) -> [u8; 32] {
    let mut hash = Sha256::new();
    hash.update(model.as_bytes());
    hash.update([0]);
    hash.update(content.as_bytes());
    hash.finalize().into()
}

pub fn validate_embeddings(
    embeddings: Vec<Vec<f32>>,
    expected_count: usize,
    dimensions: usize,
) -> Result<Vec<Vec<f32>>, AiProviderError> {
    if embeddings.len() != expected_count
        || embeddings.iter().any(|value| {
            value.len() != dimensions
                || value
                    .iter()
                    .any(|n| !n.is_finite() || n.abs() > MAX_HALF_VECTOR_VALUE)
        })
    {
        return Err(AiProviderError::InvalidResponse);
    }
    Ok(embeddings)
}

#[derive(Clone)]
pub struct SemanticSearchUseCase {
    provider: Arc<dyn AiProvider>,
    repository: Arc<dyn SemanticEmbeddingRepository>,
    model: String,
}

impl SemanticSearchUseCase {
    pub fn new(
        provider: Arc<dyn AiProvider>,
        repository: Arc<dyn SemanticEmbeddingRepository>,
        model: String,
    ) -> Result<Self, AiProviderError> {
        if model != DEFAULT_EMBEDDING_MODEL {
            return Err(AiProviderError::InvalidResponse);
        }
        Ok(Self {
            provider,
            repository,
            model,
        })
    }

    pub async fn execute(
        &self,
        user_id: Uuid,
        workspace_id: Uuid,
        query: String,
        limit: Option<i64>,
    ) -> Result<Vec<SemanticSearchResult>, AppError> {
        let query = query.trim();
        if !(2..=2_000).contains(&query.chars().count()) {
            return Err(DomainError::Validation(
                "Semantic query must contain 2 to 2000 characters",
            )
            .into());
        }
        let limit = limit.unwrap_or(DEFAULT_SEMANTIC_SEARCH_LIMIT);
        if !(1..=MAX_SEMANTIC_SEARCH_LIMIT).contains(&limit) {
            return Err(
                DomainError::Validation("Semantic search limit must be between 1 and 50").into(),
            );
        }
        let vectors = self
            .provider
            .embed(&self.model, &[query.to_string()])
            .await
            .map_err(|_| AppError::AiUnavailable)?;
        let vector = validate_embeddings(vectors, 1, EMBEDDING_DIMENSIONS)
            .map_err(|_| AppError::AiUnavailable)?
            .remove(0);
        self.repository
            .search(user_id, workspace_id, &self.model, &vector, limit)
            .await
            .map_err(AppError::from)
    }
}

#[async_trait]
impl SemanticSearch for SemanticSearchUseCase {
    async fn search(
        &self,
        workspace_id: Uuid,
        user_id: Uuid,
        query: &str,
        limit: usize,
    ) -> Result<Vec<SemanticCandidate>, RepositoryError> {
        let vectors = self
            .provider
            .embed(&self.model, &[query.to_string()])
            .await
            .map_err(|_| RepositoryError::Unexpected)?;
        let vector = validate_embeddings(vectors, 1, EMBEDDING_DIMENSIONS)
            .map_err(|_| RepositoryError::Unexpected)?
            .remove(0);
        self.repository
            .search(
                user_id,
                workspace_id,
                &self.model,
                &vector,
                i64::try_from(limit).unwrap_or(i64::MAX).clamp(1, 50),
            )
            .await
            .map(|results| {
                results
                    .into_iter()
                    .map(|result| SemanticCandidate {
                        block_id: result.block_id,
                        page_id: result.page_id,
                        page_title: result.page_title,
                        text: result.text,
                        score: result.score,
                    })
                    .collect()
            })
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::{Map, Value};
    use std::collections::HashMap;

    fn block(block_type: BlockType, properties: &[(&str, &str)]) -> Block {
        Block {
            id: Uuid::nil(),
            workspace_id: Uuid::nil(),
            block_type,
            properties: properties
                .iter()
                .map(|(k, v)| ((*k).into(), Value::from(*v)))
                .collect::<Map<_, _>>(),
            prop_versions: HashMap::new(),
            content: Vec::new(),
            parent_id: None,
            trashed_at: None,
            trashed_index: None,
        }
    }

    #[test]
    fn canonicalizes_in_fixed_order_and_skips_empty_blocks() {
        let value = block(
            BlockType::Image,
            &[
                ("caption", " caption "),
                ("text", " body "),
                ("title", " title "),
            ],
        );
        assert_eq!(
            canonical_block_text(&value).as_deref(),
            Some("title\nbody\ncaption")
        );
        assert_eq!(
            canonical_block_text(&block(BlockType::Paragraph, &[("text", "  ")])),
            None
        );
        assert_eq!(
            canonical_block_text(&block(BlockType::Divider, &[("text", "ignored")])),
            None
        );
    }

    #[test]
    fn hash_includes_model_and_content() {
        let hash = content_hash(DEFAULT_EMBEDDING_MODEL, "same");
        assert_eq!(hash, content_hash(DEFAULT_EMBEDDING_MODEL, "same"));
        assert_ne!(hash, content_hash("another-model", "same"));
        assert_ne!(hash, content_hash(DEFAULT_EMBEDDING_MODEL, "different"));
    }

    #[test]
    fn validates_provider_vectors() {
        assert!(validate_embeddings(vec![], 1, 2).is_err());
        assert!(validate_embeddings(vec![vec![1.0]], 1, 2).is_err());
        assert!(validate_embeddings(vec![vec![1.0, f32::NAN]], 1, 2).is_err());
        assert!(validate_embeddings(vec![vec![1.0, 65_505.0]], 1, 2).is_err());
        assert!(validate_embeddings(vec![vec![1.0, 2.0]], 1, 2).is_ok());
    }
}
