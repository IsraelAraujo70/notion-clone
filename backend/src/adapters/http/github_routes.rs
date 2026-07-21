use axum::Json;
use axum::extract::{Path, Query, State};
use axum::http::StatusCode;
use axum::response::Redirect;
use url::Url;
use uuid::Uuid;

use crate::adapters::http::auth_extractor::AuthenticatedUser;
use crate::adapters::http::error::HttpError;
use crate::application::github::{
    BeginGitHubInstallation, BeginGitHubInstallationInput, CompleteGitHubOAuthInput,
    LinkGitHubPullRequestInput, SetupGitHubInstallationInput,
};
use crate::application::ports::github::{
    GitHubIntegrationStatus, GitHubPullRequestFiles, GitHubPullRequestLink,
};
use crate::bootstrap::state::AppState;

pub async fn begin_installation(
    State(state): State<AppState>,
    auth: AuthenticatedUser,
    Path(workspace_id): Path<Uuid>,
    Json(input): Json<BeginGitHubInstallationInput>,
) -> Result<(StatusCode, Json<BeginGitHubInstallation>), HttpError> {
    let result = state
        .github
        .begin_installation(auth.user.id, workspace_id, input)
        .await?;
    Ok((StatusCode::CREATED, Json(result)))
}

pub async fn setup_installation(
    State(state): State<AppState>,
    Query(input): Query<SetupGitHubInstallationInput>,
) -> Redirect {
    match state.github.setup_installation(input).await {
        Ok(oauth_url) => Redirect::to(&oauth_url),
        Err(_) => github_result_redirect(&state.public_web_url, None, false),
    }
}

pub async fn complete_oauth(
    State(state): State<AppState>,
    Query(input): Query<CompleteGitHubOAuthInput>,
) -> Redirect {
    match state.github.complete_oauth(input).await {
        Ok(result) => github_result_redirect(
            &state.public_web_url,
            Some(result.return_page_id),
            result.success,
        ),
        Err(_) => github_result_redirect(&state.public_web_url, None, false),
    }
}

pub async fn list_installations(
    State(state): State<AppState>,
    auth: AuthenticatedUser,
    Path(workspace_id): Path<Uuid>,
) -> Result<Json<GitHubIntegrationStatus>, HttpError> {
    Ok(Json(
        state
            .github
            .list_installations(auth.user.id, workspace_id)
            .await?,
    ))
}

pub async fn link_pull_request(
    State(state): State<AppState>,
    auth: AuthenticatedUser,
    Path((workspace_id, block_id)): Path<(Uuid, Uuid)>,
    Json(input): Json<LinkGitHubPullRequestInput>,
) -> Result<(StatusCode, Json<GitHubPullRequestLink>), HttpError> {
    let link = state
        .github
        .link_pull_request(auth.user.id, workspace_id, block_id, input)
        .await?;
    Ok((StatusCode::CREATED, Json(link)))
}

pub async fn list_pull_request_links(
    State(state): State<AppState>,
    auth: AuthenticatedUser,
    Path(workspace_id): Path<Uuid>,
) -> Result<Json<Vec<GitHubPullRequestLink>>, HttpError> {
    Ok(Json(
        state
            .github
            .list_pull_request_links(auth.user.id, workspace_id)
            .await?,
    ))
}

pub async fn get_pull_request_link(
    State(state): State<AppState>,
    auth: AuthenticatedUser,
    Path((workspace_id, block_id)): Path<(Uuid, Uuid)>,
) -> Result<Json<Option<GitHubPullRequestLink>>, HttpError> {
    Ok(Json(
        state
            .github
            .get_pull_request_link(auth.user.id, workspace_id, block_id)
            .await?,
    ))
}

pub async fn unlink_pull_request(
    State(state): State<AppState>,
    auth: AuthenticatedUser,
    Path((workspace_id, block_id)): Path<(Uuid, Uuid)>,
) -> Result<StatusCode, HttpError> {
    state
        .github
        .unlink_pull_request(auth.user.id, workspace_id, block_id)
        .await?;
    Ok(StatusCode::NO_CONTENT)
}

pub async fn list_pull_request_files(
    State(state): State<AppState>,
    auth: AuthenticatedUser,
    Path((workspace_id, block_id)): Path<(Uuid, Uuid)>,
) -> Result<Json<GitHubPullRequestFiles>, HttpError> {
    Ok(Json(
        state
            .github
            .list_pull_request_files(auth.user.id, workspace_id, block_id)
            .await?,
    ))
}

fn github_result_redirect(
    public_web_url: &str,
    return_page_id: Option<Uuid>,
    success: bool,
) -> Redirect {
    let url = github_result_url(public_web_url, return_page_id, success);
    Redirect::to(&url)
}

fn github_result_url(public_web_url: &str, return_page_id: Option<Uuid>, success: bool) -> String {
    let mut url = Url::parse(public_web_url)
        .ok()
        .filter(|url| matches!(url.scheme(), "http" | "https") && url.host().is_some())
        .unwrap_or_else(|| Url::parse("http://localhost:3000").unwrap());
    url.set_query(None);
    url.set_fragment(None);
    url.set_path(
        &return_page_id
            .map(|page_id| format!("/dashboard/pages/{page_id}"))
            .unwrap_or_else(|| "/dashboard".into()),
    );
    url.query_pairs_mut().append_pair(
        "github_installation",
        if success { "success" } else { "error" },
    );
    url.into()
}

#[cfg(test)]
mod tests {
    use super::github_result_url;
    use uuid::Uuid;

    #[test]
    fn github_result_redirect_contains_only_the_safe_outcome() {
        assert_eq!(
            github_result_url(
                "https://app.example.test/settings?code=secret#state-secret",
                Some(Uuid::parse_str("018f84d8-4e77-7c7f-b28b-8dcb8a556332").unwrap()),
                true,
            ),
            "https://app.example.test/dashboard/pages/018f84d8-4e77-7c7f-b28b-8dcb8a556332?github_installation=success"
        );
        assert_eq!(
            github_result_url("javascript:alert(1)", None, false),
            "http://localhost:3000/dashboard?github_installation=error"
        );
    }
}
