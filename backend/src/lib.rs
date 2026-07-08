pub mod adapters;
pub mod application;
pub mod bootstrap;
pub mod domain;

use axum::Router;
use sqlx::PgPool;

pub use bootstrap::state::AppState;

pub fn app(pool: PgPool) -> Router {
    let config = bootstrap::config::Config::from_env_defaults();
    let state = bootstrap::state::AppState::from_parts(
        pool,
        config.public_web_url,
        config.resend_api_key,
        config.resend_from_email,
    );
    app_with_state(state)
}

pub fn app_with_state(state: AppState) -> Router {
    bootstrap::router::build_router(state, bootstrap::config::CorsConfig::from_env())
}
