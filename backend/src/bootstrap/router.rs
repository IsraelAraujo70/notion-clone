use axum::Router;
use axum::extract::{DefaultBodyLimit, MatchedPath};
use axum::http::Request;
use axum::routing::{delete, get, patch, post};
use tower_http::trace::TraceLayer;

use crate::adapters::http::{
    ai_routes, app_routes, auth_routes, integration_routes, media_routes, page_routes,
    workspace_routes, ws_routes,
};
use crate::bootstrap::config::CorsConfig;
use crate::bootstrap::health::{health, root};
use crate::bootstrap::state::AppState;

fn make_http_span<B>(request: &Request<B>) -> tracing::Span {
    // Never log the raw URI. WebSocket session tokens live in the query string,
    // and invite tokens live in path segments. MatchedPath keeps useful route
    // cardinality without recording either secret or attacker-controlled input.
    let route = request
        .extensions()
        .get::<MatchedPath>()
        .map(MatchedPath::as_str)
        .unwrap_or("<unmatched>");

    tracing::debug_span!(
        target: "tower_http::trace::make_span",
        "request",
        method = %request.method(),
        route,
        version = ?request.version(),
    )
}

pub fn build_router(state: AppState, cors: CorsConfig) -> Router {
    Router::new()
        .route("/", get(root))
        .route("/health", get(health))
        .route("/media/{*key}", get(media_routes::get_media))
        .route(
            "/mcp",
            post(crate::adapters::mcp::handle).layer(DefaultBodyLimit::max(1024 * 1024)),
        )
        .route("/search", get(page_routes::search))
        .route("/public/pages/{token}", get(page_routes::get_public_page))
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
        .route("/auth/me/avatar/presign", post(auth_routes::presign_avatar))
        .route(
            "/integrations/mcp/tokens",
            get(integration_routes::list_tokens).post(integration_routes::create_token),
        )
        .route(
            "/integrations/mcp/tokens/{token_id}",
            delete(integration_routes::revoke_token),
        )
        .route(
            "/workspaces",
            get(workspace_routes::list).post(workspace_routes::create),
        )
        .route(
            "/workspaces/{workspace_id}",
            delete(workspace_routes::delete_workspace),
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
            "/workspaces/{workspace_id}/pages/{page_id}/transfer",
            post(page_routes::transfer_subtree),
        )
        .route(
            "/workspaces/{workspace_id}/pages/{page_id}/public-link",
            get(page_routes::get_public_link)
                .post(page_routes::create_public_link)
                .delete(page_routes::revoke_public_link),
        )
        .route(
            "/workspaces/{workspace_id}/operations",
            get(page_routes::list_operations).post(page_routes::apply_operation),
        )
        .route(
            "/workspaces/{workspace_id}/ai/conversations",
            get(ai_routes::list_conversations).post(ai_routes::create_conversation),
        )
        .route(
            "/workspaces/{workspace_id}/ai/conversations/{conversation_id}/messages",
            get(ai_routes::messages),
        )
        .route(
            "/workspaces/{workspace_id}/ai/runs/{run_id}",
            get(ai_routes::run_status),
        )
        .route(
            "/workspaces/{workspace_id}/ai/actions/{action}",
            post(ai_routes::action).layer(DefaultBodyLimit::max(
                crate::application::ai::use_case::MAX_AI_ACTION_BODY_BYTES,
            )),
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
            "/workspaces/{workspace_id}/trash/{block_id}",
            delete(page_routes::permanently_delete),
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
        .layer(TraceLayer::new_for_http().make_span_with(make_http_span))
        .layer(cors.layer())
        .with_state(state)
}

#[cfg(test)]
mod tests {
    use std::io::{self, Write};
    use std::sync::{Arc, Mutex};

    use axum::body::Body;
    use axum::http::{Request, StatusCode};
    use axum::routing::get;
    use tower::ServiceExt;

    use super::*;

    #[derive(Clone, Default)]
    struct SharedWriter(Arc<Mutex<Vec<u8>>>);

    impl Write for SharedWriter {
        fn write(&mut self, bytes: &[u8]) -> io::Result<usize> {
            self.0.lock().unwrap().extend_from_slice(bytes);
            Ok(bytes.len())
        }

        fn flush(&mut self) -> io::Result<()> {
            Ok(())
        }
    }

    impl<'a> tracing_subscriber::fmt::MakeWriter<'a> for SharedWriter {
        type Writer = Self;

        fn make_writer(&'a self) -> Self::Writer {
            self.clone()
        }
    }

    #[tokio::test(flavor = "current_thread")]
    async fn request_trace_logs_route_template_without_query_or_path_tokens() {
        let output = SharedWriter::default();
        let subscriber = tracing_subscriber::fmt()
            .without_time()
            .with_ansi(false)
            .with_max_level(tracing::Level::DEBUG)
            .with_writer(output.clone())
            .finish();
        let _guard = tracing::subscriber::set_default(subscriber);

        let app = Router::new()
            .route(
                "/workspaces/{workspace_id}/ws",
                get(|| async { StatusCode::OK }),
            )
            .route(
                "/workspace-invites/{token}",
                get(|| async { StatusCode::OK }),
            )
            .layer(TraceLayer::new_for_http().make_span_with(make_http_span));

        for (uri, expected_status) in [
            (
                "/workspaces/11111111-1111-1111-1111-111111111111/ws?token=raw-session-secret",
                StatusCode::OK,
            ),
            ("/workspace-invites/raw-invite-secret", StatusCode::OK),
            (
                "/missing/raw-path-secret?token=unmatched-secret",
                StatusCode::NOT_FOUND,
            ),
        ] {
            let response = app
                .clone()
                .oneshot(Request::builder().uri(uri).body(Body::empty()).unwrap())
                .await
                .unwrap();
            assert_eq!(response.status(), expected_status);
        }

        let logs = String::from_utf8(output.0.lock().unwrap().clone()).unwrap();
        assert!(
            logs.contains("route=\"/workspaces/{workspace_id}/ws\""),
            "unexpected trace output: {logs}"
        );
        assert!(
            logs.contains("route=\"/workspace-invites/{token}\""),
            "unexpected trace output: {logs}"
        );
        assert!(!logs.contains("raw-session-secret"), "{logs}");
        assert!(!logs.contains("raw-invite-secret"), "{logs}");
        assert!(!logs.contains("raw-path-secret"), "{logs}");
        assert!(!logs.contains("unmatched-secret"), "{logs}");
        assert!(!logs.contains("token="), "{logs}");
    }
}
