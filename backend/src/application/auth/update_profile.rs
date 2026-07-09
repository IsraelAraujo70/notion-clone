use std::sync::Arc;

use uuid::Uuid;

use crate::application::AppError;
use crate::application::ports::auth::AuthRepository;
use crate::application::ports::storage::ObjectStorage;
use crate::domain::auth::{User, validate_display_name};

#[derive(Debug, Clone)]
pub struct UpdateProfileInput {
    pub user_id: Uuid,
    pub display_name: Option<String>,
    pub avatar_key: Option<Option<String>>,
}

#[derive(Clone)]
pub struct UpdateProfileUseCase {
    auth_repository: Arc<dyn AuthRepository>,
    storage: Arc<dyn ObjectStorage>,
}

impl UpdateProfileUseCase {
    pub fn new(auth_repository: Arc<dyn AuthRepository>, storage: Arc<dyn ObjectStorage>) -> Self {
        Self {
            auth_repository,
            storage,
        }
    }

    pub async fn execute(&self, input: UpdateProfileInput) -> Result<User, AppError> {
        if input.display_name.is_none() && input.avatar_key.is_none() {
            return Err(AppError::Domain(
                crate::domain::error::DomainError::Validation("Nothing to update"),
            ));
        }

        let display_name = match input.display_name {
            Some(name) => {
                let trimmed = name.trim().to_string();
                validate_display_name(&trimmed)?;
                Some(trimmed)
            }
            None => None,
        };

        if let Some(Some(ref key)) = input.avatar_key {
            let prefix = format!("{}/", input.user_id);
            if !key.starts_with(&prefix) || key.contains("..") {
                return Err(AppError::Domain(
                    crate::domain::error::DomainError::Validation("Invalid avatar key"),
                ));
            }
        }

        let user = self
            .auth_repository
            .update_profile(input.user_id, display_name, input.avatar_key)
            .await
            .map_err(AppError::from)?;

        Ok(attach_avatar_url(user, &self.storage))
    }
}

#[derive(Debug, Clone)]
pub struct PresignAvatarInput {
    pub user_id: Uuid,
    pub content_type: String,
}

#[derive(Debug, Clone, serde::Serialize)]
pub struct PresignAvatarResponse {
    pub upload_url: String,
    pub key: String,
    pub public_url: String,
    pub headers: Vec<PresignHeader>,
}

#[derive(Debug, Clone, serde::Serialize)]
pub struct PresignHeader {
    pub name: String,
    pub value: String,
}

#[derive(Clone)]
pub struct PresignAvatarUseCase {
    storage: Arc<dyn ObjectStorage>,
}

impl PresignAvatarUseCase {
    pub fn new(storage: Arc<dyn ObjectStorage>) -> Self {
        Self { storage }
    }

    pub async fn execute(
        &self,
        input: PresignAvatarInput,
    ) -> Result<PresignAvatarResponse, AppError> {
        if !self.storage.is_configured() {
            return Err(AppError::StorageNotConfigured);
        }

        let ext = match input.content_type.as_str() {
            "image/jpeg" => "jpg",
            "image/png" => "png",
            "image/webp" => "webp",
            _ => {
                return Err(AppError::Domain(
                    crate::domain::error::DomainError::Validation(
                        "Avatar must be jpeg, png, or webp",
                    ),
                ));
            }
        };

        let key = self.storage.avatar_key_for(input.user_id, ext);
        let upload = self
            .storage
            .presign_put(&key, &input.content_type, 2 * 1024 * 1024)
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

pub fn attach_avatar_url(user: User, storage: &Arc<dyn ObjectStorage>) -> User {
    let url = user
        .avatar_key
        .as_deref()
        .and_then(|key| storage.public_url(key));
    user.with_avatar_url(url)
}
