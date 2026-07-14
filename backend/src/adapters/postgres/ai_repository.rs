use crate::adapters::postgres::tx::map_sqlx_error;
use crate::application::ports::{RepositoryError, ai::*};
use async_trait::async_trait;
use chrono::{DateTime, Utc};
use serde_json::Value;
use sqlx::PgPool;
use uuid::Uuid;

#[derive(Clone)]
pub struct PostgresAiRepository {
    pool: PgPool,
}
impl PostgresAiRepository {
    pub fn new(pool: PgPool) -> Self {
        Self { pool }
    }
}

#[derive(sqlx::FromRow)]
struct ConversationRow {
    id: Uuid,
    workspace_id: Uuid,
    title: String,
    created_at: DateTime<Utc>,
    updated_at: DateTime<Utc>,
}
#[derive(sqlx::FromRow)]
struct MessageRow {
    id: Uuid,
    role: String,
    content: String,
    citations: Value,
    created_at: DateTime<Utc>,
}
#[derive(sqlx::FromRow)]
struct RunRow {
    id: Uuid,
    workspace_id: Uuid,
    conversation_id: Option<Uuid>,
    action: String,
    status: String,
    model: String,
    operation_group_id: Option<Uuid>,
    error: Option<String>,
    last_seq: Option<i64>,
    created_at: DateTime<Utc>,
    deadline_at: DateTime<Utc>,
    completed_at: Option<DateTime<Utc>>,
}
impl From<ConversationRow> for AiConversation {
    fn from(r: ConversationRow) -> Self {
        Self {
            id: r.id,
            workspace_id: r.workspace_id,
            title: r.title,
            created_at: r.created_at,
            updated_at: r.updated_at,
        }
    }
}
impl From<MessageRow> for StoredAiMessage {
    fn from(r: MessageRow) -> Self {
        Self {
            id: r.id,
            role: r.role,
            content: r.content,
            citations: r.citations,
            created_at: r.created_at,
        }
    }
}
impl From<RunRow> for AiRun {
    fn from(r: RunRow) -> Self {
        Self {
            id: r.id,
            workspace_id: r.workspace_id,
            conversation_id: r.conversation_id,
            action: r.action,
            status: r.status,
            model: r.model,
            operation_group_id: r.operation_group_id,
            error: r.error,
            last_seq: r.last_seq,
            created_at: r.created_at,
            deadline_at: r.deadline_at,
            completed_at: r.completed_at,
        }
    }
}

#[async_trait]
impl AiRepository for PostgresAiRepository {
    async fn list_conversations(
        &self,
        workspace_id: Uuid,
        user_id: Uuid,
    ) -> Result<Vec<AiConversation>, RepositoryError> {
        sqlx::query_as::<_,ConversationRow>("SELECT id, workspace_id, title, created_at, updated_at FROM ai_conversations WHERE workspace_id=$1 AND user_id=$2 ORDER BY updated_at DESC")
            .bind(workspace_id).bind(user_id).fetch_all(&self.pool).await.map(|rows|rows.into_iter().map(Into::into).collect()).map_err(map_sqlx_error)
    }
    async fn create_conversation(
        &self,
        c: &AiConversation,
        user_id: Uuid,
    ) -> Result<(), RepositoryError> {
        sqlx::query("INSERT INTO ai_conversations(id,workspace_id,user_id,title,created_at,updated_at) VALUES($1,$2,$3,$4,$5,$6)")
            .bind(c.id).bind(c.workspace_id).bind(user_id).bind(&c.title).bind(c.created_at).bind(c.updated_at).execute(&self.pool).await.map(|_|()).map_err(map_sqlx_error)
    }
    async fn list_messages(
        &self,
        workspace_id: Uuid,
        conversation_id: Uuid,
        user_id: Uuid,
    ) -> Result<Vec<StoredAiMessage>, RepositoryError> {
        sqlx::query_as::<_,MessageRow>("SELECT m.id,m.role,m.content,m.citations,m.created_at FROM ai_messages m JOIN ai_conversations c ON c.id=m.conversation_id AND c.workspace_id=m.workspace_id WHERE m.workspace_id=$1 AND m.conversation_id=$2 AND m.user_id=$3 AND c.user_id=$3 ORDER BY m.created_at,m.id")
            .bind(workspace_id).bind(conversation_id).bind(user_id).fetch_all(&self.pool).await.map(|rows|rows.into_iter().map(Into::into).collect()).map_err(map_sqlx_error)
    }
    async fn add_message(
        &self,
        workspace_id: Uuid,
        conversation_id: Uuid,
        user_id: Uuid,
        role: &str,
        content: &str,
        citations: &Value,
        now: DateTime<Utc>,
    ) -> Result<StoredAiMessage, RepositoryError> {
        let id = Uuid::new_v4();
        let mut tx = self.pool.begin().await.map_err(map_sqlx_error)?;
        let row=sqlx::query_as::<_,MessageRow>("INSERT INTO ai_messages(id,workspace_id,conversation_id,user_id,role,content,citations,created_at) SELECT $1,$2,$3,$4,$5,$6,$7,$8 FROM ai_conversations c WHERE c.id=$3 AND c.workspace_id=$2 AND c.user_id=$4 RETURNING id,role,content,citations,created_at").bind(id).bind(workspace_id).bind(conversation_id).bind(user_id).bind(role).bind(content).bind(citations).bind(now).fetch_optional(&mut *tx).await.map_err(map_sqlx_error)?;
        let row = row.ok_or(RepositoryError::NotFound)?;
        sqlx::query("UPDATE ai_conversations SET updated_at=$4 WHERE workspace_id=$1 AND id=$2 AND user_id=$3")
            .bind(workspace_id).bind(conversation_id).bind(user_id).bind(now)
            .execute(&mut *tx).await.map_err(map_sqlx_error)?;
        tx.commit().await.map_err(map_sqlx_error)?;
        Ok(row.into())
    }
    async fn should_generate_title(
        &self,
        workspace_id: Uuid,
        conversation_id: Uuid,
        user_id: Uuid,
    ) -> Result<bool, RepositoryError> {
        sqlx::query_scalar::<_, bool>(
            "SELECT EXISTS (
                SELECT 1
                FROM ai_conversations c
                WHERE c.workspace_id=$1 AND c.id=$2 AND c.user_id=$3
                  AND (btrim(c.title) = '' OR c.title = 'Nova conversa')
                  AND (SELECT count(*) FROM ai_messages m
                       WHERE m.workspace_id=c.workspace_id
                         AND m.conversation_id=c.id
                         AND m.user_id=c.user_id
                         AND m.role='user') = 1
            )",
        )
        .bind(workspace_id)
        .bind(conversation_id)
        .bind(user_id)
        .fetch_one(&self.pool)
        .await
        .map_err(map_sqlx_error)
    }
    async fn update_conversation_title(
        &self,
        workspace_id: Uuid,
        conversation_id: Uuid,
        user_id: Uuid,
        title: &str,
        now: DateTime<Utc>,
    ) -> Result<(), RepositoryError> {
        sqlx::query(
            "UPDATE ai_conversations
             SET title=$4, updated_at=$5
             WHERE workspace_id=$1 AND id=$2 AND user_id=$3
               AND (btrim(title) = '' OR title = 'Nova conversa')",
        )
        .bind(workspace_id)
        .bind(conversation_id)
        .bind(user_id)
        .bind(title)
        .bind(now)
        .execute(&self.pool)
        .await
        .map(|_| ())
        .map_err(map_sqlx_error)
    }
    async fn create_run(&self, r: &AiRun, user_id: Uuid) -> Result<(), RepositoryError> {
        let affected = sqlx::query("INSERT INTO ai_runs(id,workspace_id,conversation_id,user_id,action,status,model,operation_group_id,error,last_seq,created_at,deadline_at,completed_at) SELECT $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13 WHERE $3::uuid IS NULL OR EXISTS (SELECT 1 FROM ai_conversations WHERE id=$3 AND workspace_id=$2 AND user_id=$4)").bind(r.id).bind(r.workspace_id).bind(r.conversation_id).bind(user_id).bind(&r.action).bind(&r.status).bind(&r.model).bind(r.operation_group_id).bind(&r.error).bind(r.last_seq).bind(r.created_at).bind(r.deadline_at).bind(r.completed_at).execute(&self.pool).await.map_err(map_sqlx_error)?.rows_affected();
        if affected == 1 {
            Ok(())
        } else {
            Err(RepositoryError::NotFound)
        }
    }
    async fn finish_run(
        &self,
        w: Uuid,
        r: Uuid,
        u: Uuid,
        status: &str,
        g: Option<Uuid>,
        error: Option<&str>,
        last_seq: Option<i64>,
        now: DateTime<Utc>,
    ) -> Result<(), RepositoryError> {
        let n=sqlx::query("UPDATE ai_runs SET status=$4,operation_group_id=$5,error=$6,last_seq=$7,completed_at=$8 WHERE workspace_id=$1 AND id=$2 AND user_id=$3 AND status IN ('queued','running')").bind(w).bind(r).bind(u).bind(status).bind(g).bind(error).bind(last_seq).bind(now).execute(&self.pool).await.map_err(map_sqlx_error)?.rows_affected();
        if n == 0 {
            Err(RepositoryError::NotFound)
        } else {
            Ok(())
        }
    }
    async fn get_run(&self, w: Uuid, r: Uuid, u: Uuid) -> Result<AiRun, RepositoryError> {
        sqlx::query_as::<_,RunRow>("SELECT id,workspace_id,conversation_id,action,status,model,operation_group_id,error,last_seq,created_at,deadline_at,completed_at FROM ai_runs WHERE workspace_id=$1 AND id=$2 AND user_id=$3").bind(w).bind(r).bind(u).fetch_optional(&self.pool).await.map_err(map_sqlx_error)?.map(Into::into).ok_or(RepositoryError::NotFound)
    }
    async fn record_usage(
        &self,
        w: Uuid,
        r: Uuid,
        u: Uuid,
        p: &str,
        m: &str,
        x: &AiUsage,
        now: DateTime<Utc>,
    ) -> Result<(), RepositoryError> {
        sqlx::query("INSERT INTO ai_usage_events(workspace_id,user_id,run_id,provider,model,prompt_tokens,completion_tokens,created_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8)").bind(w).bind(u).bind(r).bind(p).bind(m).bind(x.prompt_tokens as i64).bind(x.completion_tokens as i64).bind(now).execute(&self.pool).await.map(|_|()).map_err(map_sqlx_error)
    }
    async fn recover_stale_runs(&self, now: DateTime<Utc>) -> Result<u64, RepositoryError> {
        sqlx::query(
            "UPDATE ai_runs SET status='failed', error='AI run interrupted', completed_at=$1
             WHERE status='running' AND deadline_at <= $1",
        )
        .bind(now)
        .execute(&self.pool)
        .await
        .map(|result| result.rows_affected())
        .map_err(map_sqlx_error)
    }
}
