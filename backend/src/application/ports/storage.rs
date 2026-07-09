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
        // Bucket `avatars`; avatares sob {user_id}/…
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
}
