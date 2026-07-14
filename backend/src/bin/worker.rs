use std::sync::Arc;
use std::time::Duration;

use notion_clone_api::adapters::ai::openrouter::OpenRouterAiProvider;
use notion_clone_api::adapters::postgres::{PostgresAiRepository, PostgresEmbeddingRepository};
use notion_clone_api::adapters::storage::{NoopObjectStorage, S3ObjectStorage};
use notion_clone_api::application::embeddings::{
    DEFAULT_EMBEDDING_MODEL, EMBEDDING_DIMENSIONS, validate_embeddings,
};
use notion_clone_api::application::ports::ObjectStorage;
use notion_clone_api::application::ports::ai::{AiProvider, AiRepository};
use notion_clone_api::application::ports::embedding::EmbeddingJobRepository;
use notion_clone_api::bootstrap::config::Config;
use sqlx::postgres::PgPoolOptions;
use sqlx::{PgPool, Postgres, Transaction};
use uuid::Uuid;

const DEFAULT_BATCH_SIZE: i64 = 25;
const MAX_RETRY_SECONDS: i64 = 3_600;
const EMBEDDING_LEASE: Duration = Duration::from_secs(120);
const EMBEDDING_PROVIDER_TIMEOUT: Duration = Duration::from_secs(90);

#[derive(Debug, sqlx::FromRow)]
struct ObjectDeletionJob {
    id: Uuid,
    object_key: String,
    attempts: i32,
}

#[derive(Debug, Default, PartialEq, Eq)]
struct BatchResult {
    deleted: usize,
    retried: usize,
}

#[derive(Debug, Default, PartialEq, Eq)]
struct EmbeddingBatchResult {
    completed: usize,
    retried: usize,
    stale: usize,
}

#[tokio::main]
async fn main() {
    tracing_subscriber::fmt()
        .with_env_filter(
            tracing_subscriber::EnvFilter::try_from_default_env().unwrap_or_else(|_| "info".into()),
        )
        .init();

    let config = Config::from_env();
    let pool = PgPoolOptions::new()
        .max_connections(5)
        .connect(&config.database_url)
        .await
        .expect("failed to connect to Postgres");
    sqlx::migrate!()
        .run(&pool)
        .await
        .expect("failed to run migrations");
    let storage: Arc<dyn ObjectStorage> = match config.s3 {
        Some(s3) => Arc::new(S3ObjectStorage::new(s3)),
        None => Arc::new(NoopObjectStorage),
    };
    let interval_seconds = env_i64("WORKER_INTERVAL_SECONDS", 5).max(1) as u64;
    let batch_size = env_i64("OBJECT_DELETION_BATCH_SIZE", DEFAULT_BATCH_SIZE).clamp(1, 100);
    let embedding_batch_size = env_i64("EMBEDDING_BATCH_SIZE", 32).clamp(1, 100);
    let embedding_dimensions = env_i64("EMBEDDING_DIMENSIONS", EMBEDDING_DIMENSIONS as i64);
    assert_eq!(
        embedding_dimensions, EMBEDDING_DIMENSIONS as i64,
        "EMBEDDING_DIMENSIONS must match the fixed Postgres halfvec(3072) schema"
    );
    let embedding_model =
        std::env::var("AI_EMBEDDING_MODEL").unwrap_or_else(|_| DEFAULT_EMBEDDING_MODEL.to_string());
    assert_eq!(
        embedding_model, DEFAULT_EMBEDDING_MODEL,
        "AI_EMBEDDING_MODEL must match the model used by transactional enqueue"
    );
    let embedding_provider = std::env::var("OPENROUTER_API_KEY")
        .ok()
        .filter(|key| !key.trim().is_empty())
        .map(|key| {
            OpenRouterAiProvider::new(
                key,
                std::env::var("OPENROUTER_BASE_URL")
                    .unwrap_or_else(|_| "https://openrouter.ai/api/v1".to_string()),
            )
        });
    let embedding_repository = PostgresEmbeddingRepository::new(pool.clone());
    let ai_repository = PostgresAiRepository::new(pool.clone());

    tracing::info!(
        interval_seconds,
        batch_size,
        embedding_batch_size,
        embedding_model,
        embeddings_enabled = embedding_provider.is_some(),
        "notion-clone-worker starting"
    );
    if embedding_provider.is_none() {
        tracing::warn!("OPENROUTER_API_KEY is not configured; embedding jobs will remain pending");
    }

    let mut ticker = tokio::time::interval(Duration::from_secs(interval_seconds));
    loop {
        ticker.tick().await;
        match ai_repository.recover_stale_runs(chrono::Utc::now()).await {
            Ok(recovered) if recovered > 0 => {
                tracing::warn!(recovered, "stale AI runs marked failed")
            }
            Ok(_) => tracing::debug!("no stale AI runs"),
            Err(error) => tracing::error!(error = ?error, "stale AI run recovery failed"),
        }
        match process_object_deletions(&pool, storage.as_ref(), batch_size).await {
            Ok(result) if result != BatchResult::default() => tracing::info!(
                deleted = result.deleted,
                retried = result.retried,
                "object deletion batch completed"
            ),
            Ok(_) => tracing::debug!("no pending object deletions"),
            Err(error) => tracing::error!(error = %error, "object deletion batch failed"),
        }
        if let Some(provider) = embedding_provider.as_ref() {
            match process_embeddings(
                &embedding_repository,
                provider,
                &embedding_model,
                embedding_batch_size,
            )
            .await
            {
                Ok(result) if result != EmbeddingBatchResult::default() => tracing::info!(
                    completed = result.completed,
                    retried = result.retried,
                    stale = result.stale,
                    "embedding batch completed"
                ),
                Ok(_) => tracing::debug!("no pending embedding jobs"),
                Err(error) => tracing::error!(error, "embedding batch failed"),
            }
        }
    }
}

async fn process_embeddings(
    repository: &dyn EmbeddingJobRepository,
    provider: &dyn AiProvider,
    model: &str,
    batch_size: i64,
) -> Result<EmbeddingBatchResult, String> {
    let jobs = repository
        .claim(batch_size, EMBEDDING_LEASE)
        .await
        .map_err(|error| format!("claim failed: {error:?}"))?;
    if jobs.is_empty() {
        return Ok(EmbeddingBatchResult::default());
    }
    let oldest_lag_seconds = jobs
        .iter()
        .map(|job| (chrono::Utc::now() - job.created_at).num_seconds().max(0))
        .max()
        .unwrap_or(0);
    tracing::info!(
        pending = jobs.len(),
        oldest_lag_seconds,
        "embedding jobs claimed"
    );

    if jobs
        .iter()
        .any(|job| job.model != model || job.dimensions != EMBEDDING_DIMENSIONS)
    {
        let mut result = EmbeddingBatchResult::default();
        for job in &jobs {
            if repository
                .retry(job, "embedding job model or dimensions do not match worker")
                .await
                .map_err(|error| format!("retry failed: {error:?}"))?
            {
                result.retried += 1;
            } else {
                result.stale += 1;
            }
        }
        return Ok(result);
    }

    let inputs = jobs
        .iter()
        .map(|job| job.content.clone())
        .collect::<Vec<_>>();
    let provider_result =
        tokio::time::timeout(EMBEDDING_PROVIDER_TIMEOUT, provider.embed(model, &inputs)).await;
    let vectors = match provider_result {
        Ok(Ok(vectors)) => validate_embeddings(vectors, jobs.len(), EMBEDDING_DIMENSIONS),
        Ok(Err(error)) => Err(error),
        Err(_) => Err(notion_clone_api::application::ports::ai::AiProviderError::Unavailable),
    };
    let vectors = match vectors {
        Ok(vectors) => vectors,
        Err(error) => {
            let mut result = EmbeddingBatchResult::default();
            for job in &jobs {
                if repository
                    .retry(job, &format!("provider error: {error:?}"))
                    .await
                    .map_err(|retry_error| format!("retry failed: {retry_error:?}"))?
                {
                    result.retried += 1;
                } else {
                    result.stale += 1;
                }
            }
            return Ok(result);
        }
    };

    let mut result = EmbeddingBatchResult::default();
    for (job, vector) in jobs.iter().zip(vectors.iter()) {
        if repository
            .complete(job, vector)
            .await
            .map_err(|error| format!("completion failed: {error:?}"))?
        {
            result.completed += 1;
        } else {
            result.stale += 1;
        }
    }
    Ok(result)
}

async fn process_object_deletions(
    pool: &PgPool,
    storage: &dyn ObjectStorage,
    batch_size: i64,
) -> Result<BatchResult, sqlx::Error> {
    let mut tx = pool.begin().await?;
    let jobs = claim_jobs(&mut tx, batch_size).await?;
    let mut result = BatchResult::default();

    for job in jobs {
        match storage.delete_object(&job.object_key).await {
            Ok(()) => {
                sqlx::query(
                    "UPDATE object_deletion_jobs
                     SET completed_at = now(), last_error = NULL
                     WHERE id = $1",
                )
                .bind(job.id)
                .execute(&mut *tx)
                .await?;
                result.deleted += 1;
                tracing::info!(job_id = %job.id, attempts = job.attempts, "object deleted");
            }
            Err(_) => {
                let attempts = job.attempts.saturating_add(1);
                let delay_seconds = retry_delay_seconds(attempts);
                sqlx::query(
                    "UPDATE object_deletion_jobs
                     SET attempts = $2,
                         available_at = now() + make_interval(secs => $3::double precision),
                         last_error = 'object storage delete failed'
                     WHERE id = $1",
                )
                .bind(job.id)
                .bind(attempts)
                .bind(delay_seconds as f64)
                .execute(&mut *tx)
                .await?;
                result.retried += 1;
                tracing::warn!(
                    job_id = %job.id,
                    attempts,
                    delay_seconds,
                    "object deletion scheduled for retry"
                );
            }
        }
    }

    tx.commit().await?;
    Ok(result)
}

async fn claim_jobs(
    tx: &mut Transaction<'_, Postgres>,
    batch_size: i64,
) -> Result<Vec<ObjectDeletionJob>, sqlx::Error> {
    sqlx::query_as::<_, ObjectDeletionJob>(
        "SELECT id, object_key, attempts
         FROM object_deletion_jobs
         WHERE completed_at IS NULL AND available_at <= now()
         ORDER BY available_at, created_at
         FOR UPDATE SKIP LOCKED
         LIMIT $1",
    )
    .bind(batch_size)
    .fetch_all(&mut **tx)
    .await
}

fn retry_delay_seconds(attempts: i32) -> i64 {
    let exponent = attempts.saturating_sub(1).clamp(0, 20) as u32;
    5_i64
        .saturating_mul(2_i64.saturating_pow(exponent))
        .min(MAX_RETRY_SECONDS)
}

fn env_i64(name: &str, default: i64) -> i64 {
    std::env::var(name)
        .ok()
        .and_then(|value| value.parse().ok())
        .unwrap_or(default)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn retry_delay_is_exponential_and_capped() {
        assert_eq!(retry_delay_seconds(1), 5);
        assert_eq!(retry_delay_seconds(2), 10);
        assert_eq!(retry_delay_seconds(3), 20);
        assert_eq!(retry_delay_seconds(20), MAX_RETRY_SECONDS);
        assert_eq!(retry_delay_seconds(i32::MAX), MAX_RETRY_SECONDS);
    }

    #[test]
    fn retry_delay_handles_invalid_attempt_count_safely() {
        assert_eq!(retry_delay_seconds(0), 5);
        assert_eq!(retry_delay_seconds(-10), 5);
    }
}
