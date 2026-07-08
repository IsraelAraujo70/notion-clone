use axum::Json;
use axum::extract::State;
use axum::http::StatusCode;
use axum::response::IntoResponse;

use crate::bootstrap::state::AppState;

pub async fn root() -> impl IntoResponse {
    Json(serde_json::json!({
        "service": "notion-clone-api",
        "message": "Notion Clone API",
    }))
}

pub async fn health(State(state): State<AppState>) -> impl IntoResponse {
    match sqlx::query_scalar::<_, i32>("SELECT 1 FROM pg_extension WHERE extname = 'vector'")
        .fetch_optional(&state.pool)
        .await
    {
        Ok(Some(_)) => (
            StatusCode::OK,
            Json(serde_json::json!({"status": "ok", "service": "notion-clone-api"})),
        ),
        Ok(None) => (
            StatusCode::SERVICE_UNAVAILABLE,
            Json(serde_json::json!({"status": "degraded"})),
        ),
        Err(error) => {
            tracing::error!("health check failed: {error}");
            (
                StatusCode::SERVICE_UNAVAILABLE,
                Json(serde_json::json!({"status": "degraded"})),
            )
        }
    }
}
