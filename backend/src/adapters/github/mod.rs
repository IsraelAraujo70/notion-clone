use chrono::{DateTime, Duration, Utc};
use jsonwebtoken::{Algorithm, EncodingKey, Header, encode};
use reqwest::{Client, StatusCode};
use serde::{Deserialize, Serialize};
use std::time::Duration as StdDuration;
use url::Url;

use crate::application::ports::github::{
    GitHubGateway, GitHubGatewayError, GitHubInstallationSnapshot, GitHubPullRequestFile,
    GitHubPullRequestFileBatch, GitHubPullRequestSnapshot,
};
use crate::domain::github::GitHubPullRequestRef;

const GITHUB_API_VERSION: &str = "2022-11-28";
const GITHUB_REQUEST_TIMEOUT_SECONDS: u64 = 15;
const PULL_REQUEST_FILES_PER_PAGE: usize = 100;
const MAX_PULL_REQUEST_FILE_PAGES: usize = 5;
const PULL_REQUEST_FILES_TOTAL_TIMEOUT_SECONDS: u64 = 30;
const USER_INSTALLATIONS_PER_PAGE: usize = 100;
const MAX_USER_INSTALLATION_PAGES: usize = 10;

#[derive(Deserialize)]
struct UserInstallationResponse {
    id: i64,
}

#[derive(Deserialize)]
struct UserInstallationsResponse {
    installations: Vec<UserInstallationResponse>,
}

#[derive(Deserialize)]
struct PullRequestUserResponse {
    login: String,
}

#[derive(Deserialize)]
struct PullRequestBranchResponse {
    #[serde(rename = "ref")]
    reference: String,
    sha: String,
}

#[derive(Deserialize)]
struct PullRequestResponse {
    html_url: String,
    title: String,
    body: Option<String>,
    state: String,
    merged: bool,
    draft: bool,
    user: Option<PullRequestUserResponse>,
    head: PullRequestBranchResponse,
    base: PullRequestBranchResponse,
    additions: i64,
    deletions: i64,
    changed_files: i64,
}

impl From<PullRequestResponse> for GitHubPullRequestSnapshot {
    fn from(response: PullRequestResponse) -> Self {
        Self {
            url: response.html_url,
            title: response.title,
            body: response.body,
            state: if response.merged {
                "merged".into()
            } else {
                response.state
            },
            draft: response.draft,
            author_login: response.user.map(|user| user.login),
            head_sha: response.head.sha,
            base_ref: response.base.reference,
            head_ref: response.head.reference,
            additions: response.additions,
            deletions: response.deletions,
            changed_files: response.changed_files,
        }
    }
}

#[derive(Deserialize)]
struct PullRequestFileResponse {
    filename: String,
    previous_filename: Option<String>,
    status: String,
    additions: i64,
    deletions: i64,
    changes: i64,
    patch: Option<String>,
    blob_url: String,
}

impl From<PullRequestFileResponse> for GitHubPullRequestFile {
    fn from(response: PullRequestFileResponse) -> Self {
        Self {
            path: response.filename,
            previous_filename: response.previous_filename,
            status: response.status,
            additions: response.additions,
            deletions: response.deletions,
            changes: response.changes,
            patch: response.patch,
            blob_url: response.blob_url,
        }
    }
}

pub struct ReqwestGitHubGateway {
    client: Client,
    app_id: i64,
    app_slug: String,
    private_key: EncodingKey,
    client_id: String,
    client_secret: String,
    api_url: String,
}

impl ReqwestGitHubGateway {
    pub fn new(
        app_id: i64,
        app_slug: String,
        private_key_pem: &str,
        client_id: String,
        client_secret: String,
        api_url: String,
    ) -> Result<Self, GitHubGatewayError> {
        let private_key = EncodingKey::from_rsa_pem(private_key_pem.as_bytes())
            .map_err(|_| GitHubGatewayError::Unexpected)?;
        Ok(Self {
            client: Client::builder()
                .timeout(StdDuration::from_secs(GITHUB_REQUEST_TIMEOUT_SECONDS))
                .build()
                .map_err(|_| GitHubGatewayError::Unexpected)?,
            app_id,
            app_slug,
            private_key,
            client_id,
            client_secret,
            api_url: api_url.trim_end_matches('/').to_string(),
        })
    }

    fn app_jwt(&self, now: DateTime<Utc>) -> Result<String, GitHubGatewayError> {
        #[derive(Serialize)]
        struct Claims {
            iat: i64,
            exp: i64,
            iss: String,
        }

        encode(
            &Header::new(Algorithm::RS256),
            &Claims {
                iat: (now - Duration::seconds(60)).timestamp(),
                exp: (now + Duration::minutes(9)).timestamp(),
                iss: self.app_id.to_string(),
            },
            &self.private_key,
        )
        .map_err(|_| GitHubGatewayError::Unexpected)
    }

    async fn installation_token(
        &self,
        installation_id: i64,
        now: DateTime<Utc>,
    ) -> Result<String, GitHubGatewayError> {
        #[derive(Deserialize)]
        struct TokenResponse {
            token: String,
        }

        let response = self
            .client
            .post(format!(
                "{}/app/installations/{installation_id}/access_tokens",
                self.api_url
            ))
            .bearer_auth(self.app_jwt(now)?)
            .header("Accept", "application/vnd.github+json")
            .header("X-GitHub-Api-Version", GITHUB_API_VERSION)
            .header("User-Agent", "reason-github-app")
            .send()
            .await
            .map_err(|_| GitHubGatewayError::Unexpected)?;
        map_status(response.status())?;
        response
            .json::<TokenResponse>()
            .await
            .map(|response| response.token)
            .map_err(|_| GitHubGatewayError::Unexpected)
    }
}

#[async_trait::async_trait]
impl GitHubGateway for ReqwestGitHubGateway {
    fn installation_url(&self, state: &str) -> String {
        let mut url = Url::parse("https://github.com").expect("static GitHub URL is valid");
        url.path_segments_mut()
            .expect("GitHub URL supports path segments")
            .extend(["apps", &self.app_slug, "installations", "new"]);
        url.query_pairs_mut().append_pair("state", state);
        url.into()
    }

    fn oauth_authorization_url(&self, state: &str) -> String {
        let mut url = Url::parse("https://github.com/login/oauth/authorize")
            .expect("static GitHub URL is valid");
        url.query_pairs_mut()
            .append_pair("client_id", &self.client_id)
            .append_pair("state", state);
        url.into()
    }

    async fn exchange_oauth_code(&self, code: &str) -> Result<String, GitHubGatewayError> {
        #[derive(Serialize)]
        struct TokenRequest<'a> {
            client_id: &'a str,
            client_secret: &'a str,
            code: &'a str,
        }

        #[derive(Deserialize)]
        struct TokenResponse {
            access_token: Option<String>,
        }

        let response = self
            .client
            .post("https://github.com/login/oauth/access_token")
            .header("Accept", "application/json")
            .header("User-Agent", "reason-github-app")
            .json(&TokenRequest {
                client_id: &self.client_id,
                client_secret: &self.client_secret,
                code,
            })
            .send()
            .await
            .map_err(|_| GitHubGatewayError::Unexpected)?;
        map_status(response.status())?;
        response
            .json::<TokenResponse>()
            .await
            .map_err(|_| GitHubGatewayError::Unexpected)?
            .access_token
            .filter(|token| !token.is_empty())
            .ok_or(GitHubGatewayError::Unauthorized)
    }

    async fn user_has_installation_access(
        &self,
        user_token: &str,
        installation_id: i64,
    ) -> Result<bool, GitHubGatewayError> {
        user_has_installation_access(&self.client, &self.api_url, user_token, installation_id).await
    }

    async fn get_installation(
        &self,
        installation_id: i64,
        now: DateTime<Utc>,
    ) -> Result<GitHubInstallationSnapshot, GitHubGatewayError> {
        #[derive(Deserialize)]
        struct Account {
            login: String,
            #[serde(rename = "type")]
            account_type: String,
        }
        #[derive(Deserialize)]
        struct InstallationResponse {
            id: i64,
            account: Account,
        }

        let response = self
            .client
            .get(format!(
                "{}/app/installations/{installation_id}",
                self.api_url
            ))
            .bearer_auth(self.app_jwt(now)?)
            .header("Accept", "application/vnd.github+json")
            .header("X-GitHub-Api-Version", GITHUB_API_VERSION)
            .header("User-Agent", "reason-github-app")
            .send()
            .await
            .map_err(|_| GitHubGatewayError::Unexpected)?;
        map_status(response.status())?;
        let response = response
            .json::<InstallationResponse>()
            .await
            .map_err(|_| GitHubGatewayError::Unexpected)?;
        Ok(GitHubInstallationSnapshot {
            installation_id: response.id,
            account_login: response.account.login,
            account_type: response.account.account_type,
        })
    }

    async fn get_pull_request(
        &self,
        installation_id: i64,
        pull_request: &GitHubPullRequestRef,
        now: DateTime<Utc>,
    ) -> Result<GitHubPullRequestSnapshot, GitHubGatewayError> {
        let token = self.installation_token(installation_id, now).await?;
        let response = self
            .client
            .get(format!(
                "{}/repos/{}/{}/pulls/{}",
                self.api_url, pull_request.owner, pull_request.repository, pull_request.number
            ))
            .bearer_auth(token)
            .header("Accept", "application/vnd.github+json")
            .header("X-GitHub-Api-Version", GITHUB_API_VERSION)
            .header("User-Agent", "reason-github-app")
            .send()
            .await
            .map_err(|_| GitHubGatewayError::Unexpected)?;
        map_status(response.status())?;
        let response = response
            .json::<PullRequestResponse>()
            .await
            .map_err(|_| GitHubGatewayError::Unexpected)?;
        Ok(response.into())
    }

    async fn list_pull_request_files(
        &self,
        installation_id: i64,
        pull_request: &GitHubPullRequestRef,
        now: DateTime<Utc>,
    ) -> Result<GitHubPullRequestFileBatch, GitHubGatewayError> {
        let token = self.installation_token(installation_id, now).await?;
        tokio::time::timeout(
            StdDuration::from_secs(PULL_REQUEST_FILES_TOTAL_TIMEOUT_SECONDS),
            async {
                let mut files = Vec::new();
                let mut limit_reached = false;
                for page in 1..=MAX_PULL_REQUEST_FILE_PAGES {
                    let response = self
                        .client
                        .get(format!(
                            "{}/repos/{}/{}/pulls/{}/files",
                            self.api_url,
                            pull_request.owner,
                            pull_request.repository,
                            pull_request.number
                        ))
                        .query(&[("per_page", PULL_REQUEST_FILES_PER_PAGE), ("page", page)])
                        .bearer_auth(&token)
                        .header("Accept", "application/vnd.github+json")
                        .header("X-GitHub-Api-Version", GITHUB_API_VERSION)
                        .header("User-Agent", "reason-github-app")
                        .send()
                        .await
                        .map_err(|_| GitHubGatewayError::Unexpected)?;
                    map_status(response.status())?;
                    let page_files = response
                        .json::<Vec<PullRequestFileResponse>>()
                        .await
                        .map_err(|_| GitHubGatewayError::Unexpected)?;
                    if page_files.len() > PULL_REQUEST_FILES_PER_PAGE {
                        return Err(GitHubGatewayError::Unexpected);
                    }
                    let is_last_page = page_files.len() < PULL_REQUEST_FILES_PER_PAGE;
                    files.extend(page_files.into_iter().map(Into::into));
                    if is_last_page {
                        break;
                    }
                    if page == MAX_PULL_REQUEST_FILE_PAGES {
                        let probe = self
                            .client
                            .get(format!(
                                "{}/repos/{}/{}/pulls/{}/files",
                                self.api_url,
                                pull_request.owner,
                                pull_request.repository,
                                pull_request.number
                            ))
                            .query(&[
                                ("per_page", 1usize),
                                (
                                    "page",
                                    MAX_PULL_REQUEST_FILE_PAGES * PULL_REQUEST_FILES_PER_PAGE + 1,
                                ),
                            ])
                            .bearer_auth(&token)
                            .header("Accept", "application/vnd.github+json")
                            .header("X-GitHub-Api-Version", GITHUB_API_VERSION)
                            .header("User-Agent", "reason-github-app")
                            .send()
                            .await
                            .map_err(|_| GitHubGatewayError::Unexpected)?;
                        map_status(probe.status())?;
                        let probe_files = probe
                            .json::<Vec<PullRequestFileResponse>>()
                            .await
                            .map_err(|_| GitHubGatewayError::Unexpected)?;
                        if probe_files.len() > 1 {
                            return Err(GitHubGatewayError::Unexpected);
                        }
                        limit_reached = !probe_files.is_empty();
                    }
                }
                Ok(GitHubPullRequestFileBatch {
                    files,
                    limit_reached,
                })
            },
        )
        .await
        .map_err(|_| GitHubGatewayError::Unexpected)?
    }
}

async fn user_has_installation_access(
    client: &Client,
    api_url: &str,
    user_token: &str,
    installation_id: i64,
) -> Result<bool, GitHubGatewayError> {
    for page in 1..=MAX_USER_INSTALLATION_PAGES {
        let response = client
            .get(format!(
                "{}/user/installations",
                api_url.trim_end_matches('/')
            ))
            .query(&[("per_page", USER_INSTALLATIONS_PER_PAGE), ("page", page)])
            .bearer_auth(user_token)
            .header("Accept", "application/vnd.github+json")
            .header("X-GitHub-Api-Version", GITHUB_API_VERSION)
            .header("User-Agent", "reason-github-app")
            .send()
            .await
            .map_err(|_| GitHubGatewayError::Unexpected)?;
        match response.status() {
            status if status.is_success() => {}
            StatusCode::UNAUTHORIZED | StatusCode::FORBIDDEN | StatusCode::NOT_FOUND => {
                return Ok(false);
            }
            _ => return Err(GitHubGatewayError::Unexpected),
        }
        let response = response
            .json::<UserInstallationsResponse>()
            .await
            .map_err(|_| GitHubGatewayError::Unexpected)?;
        if response
            .installations
            .iter()
            .any(|installation| installation.id == installation_id)
        {
            return Ok(true);
        }
        if response.installations.len() < USER_INSTALLATIONS_PER_PAGE {
            return Ok(false);
        }
    }
    Ok(false)
}

fn map_status(status: StatusCode) -> Result<(), GitHubGatewayError> {
    match status {
        status if status.is_success() => Ok(()),
        StatusCode::UNAUTHORIZED | StatusCode::FORBIDDEN => Err(GitHubGatewayError::Unauthorized),
        StatusCode::NOT_FOUND => Err(GitHubGatewayError::NotFound),
        _ => Err(GitHubGatewayError::Unexpected),
    }
}

#[cfg(test)]
mod tests {
    use std::collections::HashMap;
    use std::sync::Arc;

    use axum::extract::Query;
    use axum::routing::get;
    use axum::{Json, Router};
    use serde_json::json;
    use tokio::sync::Mutex;

    use super::*;

    #[tokio::test]
    async fn verifies_user_installation_access_through_the_paginated_collection() {
        let pages = Arc::new(Mutex::new(Vec::new()));
        let captured = Arc::clone(&pages);
        let app = Router::new().route(
            "/user/installations",
            get(move |Query(query): Query<HashMap<String, usize>>| {
                let captured = Arc::clone(&captured);
                async move {
                    let page = query.get("page").copied().unwrap_or(1);
                    captured.lock().await.push(page);
                    let installations = if page == 1 {
                        (1..=USER_INSTALLATIONS_PER_PAGE)
                            .map(|id| json!({"id": id}))
                            .collect::<Vec<_>>()
                    } else {
                        vec![json!({"id": 4242})]
                    };
                    Json(json!({
                        "total_count": USER_INSTALLATIONS_PER_PAGE + 1,
                        "installations": installations
                    }))
                }
            }),
        );
        let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
        let address = listener.local_addr().unwrap();
        tokio::spawn(async move { axum::serve(listener, app).await.unwrap() });

        assert!(
            user_has_installation_access(
                &Client::new(),
                &format!("http://{address}"),
                "user-token",
                4242,
            )
            .await
            .unwrap()
        );
        assert_eq!(*pages.lock().await, vec![1, 2]);
    }

    #[tokio::test]
    async fn rejects_an_installation_absent_from_the_users_collection() {
        let app = Router::new().route(
            "/user/installations",
            get(|| async {
                Json(json!({
                    "total_count": 1,
                    "installations": [{"id": 7}]
                }))
            }),
        );
        let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
        let address = listener.local_addr().unwrap();
        tokio::spawn(async move { axum::serve(listener, app).await.unwrap() });

        assert!(
            !user_has_installation_access(
                &Client::new(),
                &format!("http://{address}"),
                "user-token",
                4242,
            )
            .await
            .unwrap()
        );
    }

    #[test]
    fn maps_pull_request_rest_response_to_snapshot() {
        let response: PullRequestResponse = serde_json::from_value(json!({
            "html_url": "https://github.com/acme/reason/pull/42",
            "title": "Review real files",
            "body": null,
            "state": "open",
            "merged": false,
            "draft": true,
            "user": { "login": "octocat" },
            "head": { "ref": "feature/review", "sha": "abc123" },
            "base": { "ref": "main", "sha": "def456" },
            "additions": 12,
            "deletions": 3,
            "changed_files": 2
        }))
        .unwrap();

        assert_eq!(
            GitHubPullRequestSnapshot::from(response),
            GitHubPullRequestSnapshot {
                url: "https://github.com/acme/reason/pull/42".into(),
                title: "Review real files".into(),
                body: None,
                state: "open".into(),
                draft: true,
                author_login: Some("octocat".into()),
                head_sha: "abc123".into(),
                base_ref: "main".into(),
                head_ref: "feature/review".into(),
                additions: 12,
                deletions: 3,
                changed_files: 2,
            }
        );
    }

    #[test]
    fn maps_merged_pull_request_state() {
        let response: PullRequestResponse = serde_json::from_value(json!({
            "html_url": "https://github.com/acme/reason/pull/42",
            "title": "Merged change",
            "body": null,
            "state": "closed",
            "merged": true,
            "draft": false,
            "user": null,
            "head": { "ref": "feature/review", "sha": "abc123" },
            "base": { "ref": "main", "sha": "def456" },
            "additions": 1,
            "deletions": 0,
            "changed_files": 1
        }))
        .unwrap();

        assert_eq!(GitHubPullRequestSnapshot::from(response).state, "merged");
    }

    #[test]
    fn maps_and_serializes_pull_request_file() {
        let response: PullRequestFileResponse = serde_json::from_value(json!({
            "filename": "backend/src/github.rs",
            "previous_filename": "backend/src/old_github.rs",
            "status": "renamed",
            "additions": 8,
            "deletions": 2,
            "changes": 10,
            "patch": null,
            "blob_url": "https://github.com/acme/reason/blob/abc/backend/src/github.rs"
        }))
        .unwrap();
        let file = GitHubPullRequestFile::from(response);

        assert_eq!(
            serde_json::to_value(file).unwrap(),
            json!({
                "path": "backend/src/github.rs",
                "previous_filename": "backend/src/old_github.rs",
                "status": "renamed",
                "additions": 8,
                "deletions": 2,
                "changes": 10,
                "patch": null,
                "blob_url": "https://github.com/acme/reason/blob/abc/backend/src/github.rs"
            })
        );
    }
}
