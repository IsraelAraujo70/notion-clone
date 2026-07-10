use async_trait::async_trait;
use uuid::Uuid;

use crate::application::ports::StorageError;

#[derive(Debug, Clone)]
pub struct PresignedUpload {
    pub upload_url: String,
    pub key: String,
    pub public_url: String,
    pub headers: Vec<(String, String)>,
}

#[async_trait]
pub trait ObjectStorage: Send + Sync {
    fn public_url(&self, key: &str) -> Option<String>;

    fn avatar_key_for(&self, user_id: Uuid, ext: &str) -> String {
        // Avatares ficam sob {user_id}/… dentro do bucket de mídia.
        format!("{user_id}/{}.{}", Uuid::new_v4(), ext)
    }

    fn page_image_key_for(&self, workspace_id: Uuid, ext: &str) -> String {
        format!("images/{workspace_id}/{}.{}", Uuid::new_v4(), ext)
    }

    fn is_configured(&self) -> bool;

    async fn presign_put(
        &self,
        key: &str,
        content_type: &str,
        max_bytes: u64,
    ) -> Result<PresignedUpload, StorageError>;

    async fn presign_get(&self, key: &str) -> Result<String, StorageError>;

    /// Permanently removes an object. Implementations must treat a missing object as success so
    /// retrying an outbox job remains idempotent.
    async fn delete_object(&self, key: &str) -> Result<(), StorageError>;
}
