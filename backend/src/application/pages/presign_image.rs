use std::sync::Arc;

use uuid::Uuid;

use crate::application::AppError;
use crate::application::auth::update_profile::{PresignAvatarResponse, PresignHeader};
use crate::application::ports::storage::ObjectStorage;
use crate::application::ports::workspace::WorkspaceRepository;
use crate::application::workspaces::permissions::require_writer;

#[derive(Debug, Clone)]
pub struct PresignPageImageInput {
    pub user_id: Uuid,
    pub workspace_id: Uuid,
    pub content_type: String,
}

#[derive(Clone)]
pub struct PresignPageImageUseCase {
    workspace_repository: Arc<dyn WorkspaceRepository>,
    storage: Arc<dyn ObjectStorage>,
}

impl PresignPageImageUseCase {
    pub fn new(
        workspace_repository: Arc<dyn WorkspaceRepository>,
        storage: Arc<dyn ObjectStorage>,
    ) -> Self {
        Self {
            workspace_repository,
            storage,
        }
    }

    pub async fn execute(
        &self,
        input: PresignPageImageInput,
    ) -> Result<PresignAvatarResponse, AppError> {
        require_writer(
            &self.workspace_repository,
            input.workspace_id,
            input.user_id,
        )
        .await?;

        if !self.storage.is_configured() {
            return Err(AppError::StorageNotConfigured);
        }

        let ext = match input.content_type.as_str() {
            "image/jpeg" => "jpg",
            "image/png" => "png",
            "image/webp" => "webp",
            "image/gif" => "gif",
            _ => {
                return Err(AppError::Domain(
                    crate::domain::error::DomainError::Validation(
                        "Image must be jpeg, png, webp, or gif",
                    ),
                ));
            }
        };

        let key = self.storage.page_image_key_for(input.workspace_id, ext);
        let upload = self
            .storage
            .presign_put(&key, &input.content_type, 10 * 1024 * 1024)
            .await
            .map_err(|error| match error {
                crate::application::ports::StorageError::NotConfigured => {
                    AppError::StorageNotConfigured
                }
                crate::application::ports::StorageError::InvalidContentType => AppError::Domain(
                    crate::domain::error::DomainError::Validation("Invalid content type"),
                ),
                crate::application::ports::StorageError::Unexpected => AppError::Internal,
            })?;

        Ok(PresignAvatarResponse {
            upload_url: upload.upload_url,
            key: upload.key,
            public_url: upload.public_url,
            headers: upload
                .headers
                .into_iter()
                .map(|(name, value)| PresignHeader { name, value })
                .collect(),
        })
    }
}
