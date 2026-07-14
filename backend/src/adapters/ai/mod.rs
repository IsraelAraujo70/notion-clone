pub mod openrouter;

use crate::application::ports::ai::{AiChatRequest, AiProvider, AiProviderError, AiStream};
use async_trait::async_trait;

pub struct NoopAiProvider;

#[async_trait]
impl AiProvider for NoopAiProvider {
    async fn chat_stream(&self, _: AiChatRequest) -> Result<AiStream, AiProviderError> {
        Err(AiProviderError::Unavailable)
    }
    async fn embed(&self, _: &str, _: &[String]) -> Result<Vec<Vec<f32>>, AiProviderError> {
        Err(AiProviderError::Unavailable)
    }
    fn name(&self) -> &'static str {
        "noop"
    }
}
