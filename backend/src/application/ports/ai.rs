use async_trait::async_trait;
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use tokio::sync::mpsc;
use uuid::Uuid;

use crate::application::ports::RepositoryError;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "snake_case")]
pub enum AiRole {
    System,
    User,
    Assistant,
    Tool,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct AiMessage {
    pub role: AiRole,
    pub content: String,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub tool_calls: Vec<AiToolCall>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub tool_call_id: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct AiToolDefinition {
    pub name: String,
    pub description: String,
    pub parameters: Value,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct AiToolCall {
    pub id: String,
    pub name: String,
    pub arguments: Value,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default, PartialEq, Eq)]
pub struct AiUsage {
    pub prompt_tokens: u64,
    pub completion_tokens: u64,
}

#[derive(Debug, Clone)]
pub struct AiChatRequest {
    pub model: String,
    pub messages: Vec<AiMessage>,
    pub tools: Vec<AiToolDefinition>,
}

#[derive(Debug, Clone, PartialEq)]
pub enum AiStreamDelta {
    Text(String),
    ToolCall(AiToolCall),
    Usage(AiUsage),
}

pub type AiStream = mpsc::Receiver<Result<AiStreamDelta, AiProviderError>>;

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum AiProviderError {
    Unavailable,
    InvalidResponse,
    RateLimited,
}

#[async_trait]
pub trait AiProvider: Send + Sync {
    async fn chat_stream(&self, request: AiChatRequest) -> Result<AiStream, AiProviderError>;
    async fn embed(&self, model: &str, inputs: &[String])
    -> Result<Vec<Vec<f32>>, AiProviderError>;
    fn name(&self) -> &'static str;
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct SemanticCandidate {
    pub block_id: Uuid,
    pub page_id: Uuid,
    pub page_title: String,
    pub text: String,
    pub score: f32,
}

#[async_trait]
pub trait SemanticSearch: Send + Sync {
    async fn search(
        &self,
        workspace_id: Uuid,
        user_id: Uuid,
        query: &str,
        limit: usize,
    ) -> Result<Vec<SemanticCandidate>, RepositoryError>;
}

#[derive(Debug, Clone, Serialize)]
pub struct AiConversation {
    pub id: Uuid,
    pub workspace_id: Uuid,
    pub title: String,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Serialize)]
pub struct StoredAiMessage {
    pub id: Uuid,
    pub role: String,
    pub content: String,
    pub citations: Value,
    pub created_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Serialize)]
pub struct AiRun {
    pub id: Uuid,
    pub workspace_id: Uuid,
    pub conversation_id: Option<Uuid>,
    pub action: String,
    pub status: String,
    pub model: String,
    pub operation_group_id: Option<Uuid>,
    pub error: Option<String>,
    pub last_seq: Option<i64>,
    pub created_at: DateTime<Utc>,
    pub deadline_at: DateTime<Utc>,
    pub completed_at: Option<DateTime<Utc>>,
}

#[async_trait]
pub trait AiRepository: Send + Sync {
    async fn list_conversations(
        &self,
        workspace_id: Uuid,
        user_id: Uuid,
    ) -> Result<Vec<AiConversation>, RepositoryError>;
    async fn create_conversation(
        &self,
        conversation: &AiConversation,
        user_id: Uuid,
    ) -> Result<(), RepositoryError>;
    async fn list_messages(
        &self,
        workspace_id: Uuid,
        conversation_id: Uuid,
        user_id: Uuid,
    ) -> Result<Vec<StoredAiMessage>, RepositoryError>;
    async fn add_message(
        &self,
        workspace_id: Uuid,
        conversation_id: Uuid,
        user_id: Uuid,
        role: &str,
        content: &str,
        citations: &Value,
        now: DateTime<Utc>,
    ) -> Result<StoredAiMessage, RepositoryError>;
    async fn should_generate_title(
        &self,
        workspace_id: Uuid,
        conversation_id: Uuid,
        user_id: Uuid,
    ) -> Result<bool, RepositoryError>;
    async fn update_conversation_title(
        &self,
        workspace_id: Uuid,
        conversation_id: Uuid,
        user_id: Uuid,
        title: &str,
        now: DateTime<Utc>,
    ) -> Result<(), RepositoryError>;
    async fn create_run(&self, run: &AiRun, user_id: Uuid) -> Result<(), RepositoryError>;
    async fn finish_run(
        &self,
        workspace_id: Uuid,
        run_id: Uuid,
        user_id: Uuid,
        status: &str,
        group_id: Option<Uuid>,
        error: Option<&str>,
        last_seq: Option<i64>,
        now: DateTime<Utc>,
    ) -> Result<(), RepositoryError>;
    async fn get_run(
        &self,
        workspace_id: Uuid,
        run_id: Uuid,
        user_id: Uuid,
    ) -> Result<AiRun, RepositoryError>;
    async fn record_usage(
        &self,
        workspace_id: Uuid,
        run_id: Uuid,
        user_id: Uuid,
        provider: &str,
        model: &str,
        usage: &AiUsage,
        now: DateTime<Utc>,
    ) -> Result<(), RepositoryError>;
    async fn recover_stale_runs(&self, now: DateTime<Utc>) -> Result<u64, RepositoryError>;
}

#[derive(Default)]
pub struct NoopSemanticSearch;

#[async_trait]
impl SemanticSearch for NoopSemanticSearch {
    async fn search(
        &self,
        _: Uuid,
        _: Uuid,
        _: &str,
        _: usize,
    ) -> Result<Vec<SemanticCandidate>, RepositoryError> {
        Ok(Vec::new())
    }
}
