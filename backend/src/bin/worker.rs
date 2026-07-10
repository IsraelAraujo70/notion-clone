use std::sync::Arc;
use std::time::Duration;

use notion_clone_api::adapters::storage::{NoopObjectStorage, S3ObjectStorage};
use notion_clone_api::application::ports::ObjectStorage;
use notion_clone_api::bootstrap::config::Config;
use sqlx::postgres::PgPoolOptions;
use sqlx::{PgPool, Postgres, Transaction};
use uuid::Uuid;

const DEFAULT_BATCH_SIZE: i64 = 25;
const MAX_RETRY_SECONDS: i64 = 3_600;

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

    tracing::info!(interval_seconds, batch_size, "notion-clone-worker starting");

    let mut ticker = tokio::time::interval(Duration::from_secs(interval_seconds));
    loop {
        ticker.tick().await;
        match process_object_deletions(&pool, storage.as_ref(), batch_size).await {
            Ok(result) if result != BatchResult::default() => tracing::info!(
                deleted = result.deleted,
                retried = result.retried,
                "object deletion batch completed"
            ),
            Ok(_) => tracing::debug!("no pending object deletions"),
            Err(error) => tracing::error!(error = %error, "object deletion batch failed"),
        }
    }
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
