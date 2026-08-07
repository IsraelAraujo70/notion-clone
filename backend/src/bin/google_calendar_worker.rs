use std::time::Duration;

use notion_clone_api::bootstrap::config::Config;
use notion_clone_api::bootstrap::state::AppState;
use sqlx::postgres::PgPoolOptions;

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
    let enabled = config.google_calendar.is_some();
    let state = AppState::from_parts(
        pool,
        config.public_web_url,
        config.mcp_cursor_signing_key,
        config.resend_api_key,
        config.resend_from_email,
        config.s3,
        config.github,
        config.google_calendar,
    );
    let interval_seconds = env_i64("GOOGLE_CALENDAR_WORKER_INTERVAL_SECONDS", 10).max(1) as u64;
    let batch_size = env_i64("GOOGLE_CALENDAR_SYNC_BATCH_SIZE", 20).clamp(1, 100);
    tracing::info!(
        event = "google_calendar_worker_started",
        enabled,
        interval_seconds,
        batch_size
    );
    let mut ticker = tokio::time::interval(Duration::from_secs(interval_seconds));
    loop {
        ticker.tick().await;
        match state.google_calendar_sync.run_once(batch_size).await {
            Ok(result) if result.claimed > 0 => tracing::info!(
                event = "google_calendar_sync_batch_completed",
                google_calendar_sync_jobs_claimed = result.claimed,
                google_calendar_sync_jobs_succeeded = result.succeeded,
                google_calendar_sync_failures_total = result.failed,
                google_calendar_events_cached = result.events,
            ),
            Ok(_) => tracing::debug!(event = "google_calendar_sync_idle"),
            Err(error) => tracing::error!(
                event = "google_calendar_sync_batch_failed",
                error = ?error,
            ),
        }
    }
}

fn env_i64(name: &str, default: i64) -> i64 {
    std::env::var(name)
        .ok()
        .and_then(|value| value.parse().ok())
        .unwrap_or(default)
}
