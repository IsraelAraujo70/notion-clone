use std::time::Duration;

// Espelha o worker do drive-clone: um serviço que fica vivo e tica num intervalo.
// Aqui ainda não há jobs (trash purge, embeddings e compaction chegam no M6);
// o loop existe para o serviço subir verde em vez de encerrar e crashar.
// ponytail: corpo do tick vazio de propósito — preencher quando o M6 chegar.
#[tokio::main]
async fn main() {
    tracing_subscriber::fmt()
        .with_env_filter(
            tracing_subscriber::EnvFilter::try_from_default_env().unwrap_or_else(|_| "info".into()),
        )
        .init();

    let interval_seconds: u64 = std::env::var("WORKER_INTERVAL_SECONDS")
        .ok()
        .and_then(|value| value.parse().ok())
        .unwrap_or(300)
        .max(1);

    tracing::info!(interval_seconds, "notion-clone-worker starting (no jobs until M6)");

    let mut ticker = tokio::time::interval(Duration::from_secs(interval_seconds));
    loop {
        ticker.tick().await;
        tracing::debug!("worker tick: nothing to do yet");
    }
}
