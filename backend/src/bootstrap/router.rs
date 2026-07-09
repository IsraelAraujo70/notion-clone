use axum::Router;
use axum::routing::{delete, get, patch, post};
use tower_http::trace::TraceLayer;

use crate::adapters::http::{app_routes, auth_routes, page_routes, workspace_routes, ws_routes};
use crate::bootstrap::config::CorsConfig;
use crate::bootstrap::health::{health, root};
use crate::bootstrap::state::AppState;

pub fn build_router(state: AppState, cors: CorsConfig) -> Router {
    Router::new()
        .route("/", get(root))
        .route("/health", get(health))
        .route("/auth/signup", post(auth_routes::signup))
        .route("/auth/login", post(auth_routes::login))
        .route(
            "/auth/password/forgot",
            post(auth_routes::request_password_reset),
        )
        .route("/auth/password/reset", post(auth_routes::reset_password))
        .route("/auth/password/change", post(auth_routes::change_password))
        .route("/auth/logout", post(auth_routes::logout))
        .route(
            "/auth/me",
            get(auth_routes::me).patch(auth_routes::update_profile),
        )
        .route(
            "/auth/me/avatar/presign",
            post(auth_routes::presign_avatar),
        )
        .route(
            "/workspaces",
            get(workspace_routes::list).post(workspace_routes::create),
        )
        .route(
            "/workspaces/{workspace_id}/members",
            get(workspace_routes::list_members),
        )
        .route(
            "/workspaces/{workspace_id}/members/{user_id}",
            patch(workspace_routes::update_member_role).delete(workspace_routes::remove_member),
        )
        .route(
            "/workspaces/{workspace_id}/invites",
            get(workspace_routes::list_invites).post(workspace_routes::invite_member),
        )
        .route(
            "/workspaces/{workspace_id}/invites/{invite_id}",
            delete(workspace_routes::revoke_invite),
        )
        .route(
            "/workspaces/{workspace_id}/pages",
            get(page_routes::list_pages),
        )
        .route(
            "/workspaces/{workspace_id}/pages/{page_id}",
            get(page_routes::get_page),
        )
        .route(
            "/workspaces/{workspace_id}/operations",
            get(page_routes::list_operations).post(page_routes::apply_operation),
        )
        .route(
            "/workspaces/{workspace_id}/ws",
            get(ws_routes::workspace_ws),
        )
        .route(
            "/workspaces/{workspace_id}/trash",
            get(page_routes::list_trash),
        )
        .route(
            "/workspaces/{workspace_id}/uploads/presign",
            post(page_routes::presign_image),
        )
        .route(
            "/workspace-invites/{token}",
            get(workspace_routes::invite_preview),
        )
        .route(
            "/workspace-invites/{token}/accept",
            post(workspace_routes::accept_invite),
        )
        .route("/app/summary", get(app_routes::summary))
        .layer(TraceLayer::new_for_http())
        .layer(cors.layer())
        .with_state(state)
}
