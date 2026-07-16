use std::sync::Arc;

use serde::Serialize;
use uuid::Uuid;

use crate::application::AppError;
use crate::application::ports::StorageError;
use crate::application::ports::page::PageRepository;
use crate::application::ports::storage::{ObjectStorage, StoredObject};
use crate::application::ports::workspace::WorkspaceRepository;
use crate::application::workspaces::permissions::require_member;
use crate::domain::block::BlockType;
use crate::domain::error::DomainError;

const MAX_MCP_IMAGE_BYTES: u64 = 10 * 1024 * 1024;

#[derive(Debug, Clone, Serialize)]
pub struct ImageMetadata {
    pub block_id: Uuid,
    pub page_id: Uuid,
    pub key: String,
    pub caption: String,
    pub content_type: String,
    pub size: usize,
}

#[derive(Debug, Clone)]
pub struct ImageContent {
    pub metadata: ImageMetadata,
    pub bytes: Vec<u8>,
}

#[derive(Clone)]
pub struct GetImageUseCase {
    pages: Arc<dyn PageRepository>,
    workspaces: Arc<dyn WorkspaceRepository>,
    storage: Arc<dyn ObjectStorage>,
}

impl GetImageUseCase {
    pub fn new(
        pages: Arc<dyn PageRepository>,
        workspaces: Arc<dyn WorkspaceRepository>,
        storage: Arc<dyn ObjectStorage>,
    ) -> Self {
        Self {
            pages,
            workspaces,
            storage,
        }
    }

    pub async fn execute(
        &self,
        user_id: Uuid,
        workspace_id: Uuid,
        block_id: Uuid,
    ) -> Result<ImageContent, AppError> {
        require_member(&self.workspaces, workspace_id, user_id).await?;
        let page = self
            .pages
            .get_page_for_block(workspace_id, block_id)
            .await?;
        let block = page
            .page
            .blocks
            .iter()
            .find(|block| block.id == block_id && block.trashed_at.is_none())
            .ok_or(DomainError::PageNotFound)?;
        if block.block_type != BlockType::Image {
            return Err(DomainError::Validation("Block must be an image").into());
        }
        let key = block
            .properties
            .get("key")
            .and_then(serde_json::Value::as_str)
            .filter(|key| key.starts_with(&format!("images/{workspace_id}/")))
            .ok_or(DomainError::Validation(
                "Image block has an invalid object key",
            ))?;
        let StoredObject {
            bytes,
            content_type,
        } = self
            .storage
            .get_object(key, MAX_MCP_IMAGE_BYTES)
            .await
            .map_err(|error| match error {
                StorageError::NotConfigured => AppError::StorageNotConfigured,
                StorageError::InvalidContentType | StorageError::Unexpected => AppError::Internal,
            })?;
        if !content_type.starts_with("image/") {
            return Err(AppError::Internal);
        }
        let caption = block
            .properties
            .get("caption")
            .and_then(serde_json::Value::as_str)
            .unwrap_or_default()
            .to_string();
        Ok(ImageContent {
            metadata: ImageMetadata {
                block_id,
                page_id: page.page.root_id,
                key: key.to_string(),
                caption,
                content_type,
                size: bytes.len(),
            },
            bytes,
        })
    }
}
