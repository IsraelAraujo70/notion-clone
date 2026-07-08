use axum::{routing::get, Json, Router};
use serde::Serialize;
use tower_http::{cors::CorsLayer, trace::TraceLayer};

#[derive(Serialize)]
struct HealthResponse {
    status: &'static str,
}

pub fn app() -> Router {
    Router::new()
        .route("/health", get(health))
        .layer(TraceLayer::new_for_http())
        .layer(CorsLayer::permissive())
}

// M2 will make /health check Postgres + pgvector.
async fn health() -> Json<HealthResponse> {
    Json(HealthResponse { status: "ok" })
}
