use async_trait::async_trait;
use sqlx::{PgPool, Postgres, Transaction};
use uuid::Uuid;

use crate::adapters::postgres::tx::map_sqlx_error;
use crate::application::ports::RepositoryError;
use crate::application::ports::github::{
    CreateInstallationState, GitHubInstallation, GitHubInstallationSnapshot, GitHubPullRequestLink,
    GitHubPullRequestLinkContext, GitHubRepository, PendingGitHubInstallation, SavePullRequestLink,
};
use crate::domain::error::DomainError;

const INVALID_LINK_BLOCK: &str =
    "GitHub pull requests can only be linked to a page or database row in this workspace";

#[derive(Debug, Clone)]
pub struct PostgresGitHubRepository {
    pool: PgPool,
}

#[derive(sqlx::FromRow)]
struct InstallationRow {
    id: Uuid,
    workspace_id: Uuid,
    installation_id: i64,
    account_login: String,
    account_type: String,
    created_at: chrono::DateTime<chrono::Utc>,
    updated_at: chrono::DateTime<chrono::Utc>,
}

impl From<InstallationRow> for GitHubInstallation {
    fn from(row: InstallationRow) -> Self {
        Self {
            id: row.id,
            workspace_id: row.workspace_id,
            installation_id: row.installation_id,
            account_login: row.account_login,
            account_type: row.account_type,
            created_at: row.created_at,
            updated_at: row.updated_at,
        }
    }
}

#[derive(sqlx::FromRow)]
struct PullRequestLinkRow {
    id: Uuid,
    workspace_id: Uuid,
    block_id: Uuid,
    owner: String,
    repository: String,
    pull_number: i64,
    url: String,
    title: String,
    body: Option<String>,
    state: String,
    draft: bool,
    author_login: Option<String>,
    head_sha: String,
    base_ref: String,
    head_ref: String,
    additions: i64,
    deletions: i64,
    changed_files: i64,
    created_at: chrono::DateTime<chrono::Utc>,
    updated_at: chrono::DateTime<chrono::Utc>,
}

#[derive(sqlx::FromRow)]
struct PullRequestLinkContextRow {
    #[sqlx(flatten)]
    link: PullRequestLinkRow,
    installation_id: i64,
}

impl From<PullRequestLinkRow> for GitHubPullRequestLink {
    fn from(row: PullRequestLinkRow) -> Self {
        Self {
            id: row.id,
            workspace_id: row.workspace_id,
            block_id: row.block_id,
            owner: row.owner,
            repository: row.repository,
            pull_number: row.pull_number,
            url: row.url,
            title: row.title,
            body: row.body,
            state: row.state,
            draft: row.draft,
            author_login: row.author_login,
            head_sha: row.head_sha,
            base_ref: row.base_ref,
            head_ref: row.head_ref,
            additions: row.additions,
            deletions: row.deletions,
            changed_files: row.changed_files,
            created_at: row.created_at,
            updated_at: row.updated_at,
        }
    }
}

impl PostgresGitHubRepository {
    pub fn new(pool: PgPool) -> Self {
        Self { pool }
    }
}

async fn validate_link_block(
    tx: &mut Transaction<'_, Postgres>,
    workspace_id: Uuid,
    block_id: Uuid,
) -> Result<(), RepositoryError> {
    let valid = sqlx::query_scalar::<_, bool>(
        "SELECT EXISTS (
             SELECT 1
             FROM blocks b
             JOIN workspaces w ON w.id = b.workspace_id
             WHERE b.id = $1 AND b.workspace_id = $2
               AND b.type IN ('page', 'database_row') AND b.trashed_at IS NULL
         )",
    )
    .bind(block_id)
    .bind(workspace_id)
    .fetch_one(&mut **tx)
    .await
    .map_err(map_sqlx_error)?;
    if valid {
        Ok(())
    } else {
        Err(DomainError::Validation(INVALID_LINK_BLOCK).into())
    }
}

#[async_trait]
impl GitHubRepository for PostgresGitHubRepository {
    async fn create_installation_state(
        &self,
        input: CreateInstallationState,
    ) -> Result<(), RepositoryError> {
        sqlx::query(
            "WITH stale AS (
                 DELETE FROM github_installation_states WHERE expires_at <= $7
             )
             INSERT INTO github_installation_states
                (id, workspace_id, initiated_by, return_page_id, state_hash, kind,
                 installation_id, expires_at, created_at)
             SELECT $1, w.id, $3, $4, $5, 'setup', NULL, $6, $7
             FROM workspaces w WHERE w.id = $2",
        )
        .bind(input.id)
        .bind(input.workspace_id)
        .bind(input.initiated_by)
        .bind(input.return_page_id)
        .bind(input.state_hash)
        .bind(input.expires_at)
        .bind(input.created_at)
        .execute(&self.pool)
        .await
        .map_err(map_sqlx_error)
        .and_then(|result| {
            if result.rows_affected() == 1 {
                Ok(())
            } else {
                Err(RepositoryError::NotFound)
            }
        })
    }

    async fn exchange_setup_state(
        &self,
        state_hash: &str,
        installation_id: i64,
        oauth_state_id: Uuid,
        oauth_state_hash: &str,
        expires_at: chrono::DateTime<chrono::Utc>,
        now: chrono::DateTime<chrono::Utc>,
    ) -> Result<bool, RepositoryError> {
        let created = sqlx::query_scalar::<_, Uuid>(
            "WITH stale AS (
                 DELETE FROM github_installation_states WHERE expires_at <= $6
             ), consumed AS (
                 DELETE FROM github_installation_states
                 WHERE state_hash = $1 AND kind = 'setup' AND expires_at > $6
                 RETURNING workspace_id, initiated_by, return_page_id
             )
             INSERT INTO github_installation_states
                (id, workspace_id, initiated_by, return_page_id, state_hash, kind,
                 installation_id, expires_at, created_at)
             SELECT $3, workspace_id, initiated_by, return_page_id, $4, 'oauth', $2, $5, $6
             FROM consumed
             RETURNING id",
        )
        .bind(state_hash)
        .bind(installation_id)
        .bind(oauth_state_id)
        .bind(oauth_state_hash)
        .bind(expires_at)
        .bind(now)
        .fetch_optional(&self.pool)
        .await
        .map_err(map_sqlx_error)?;
        Ok(created.is_some())
    }

    async fn consume_oauth_state(
        &self,
        state_hash: &str,
        now: chrono::DateTime<chrono::Utc>,
    ) -> Result<Option<PendingGitHubInstallation>, RepositoryError> {
        sqlx::query_as::<_, (Uuid, Uuid, i64, Uuid)>(
            "WITH stale AS (
                 DELETE FROM github_installation_states WHERE expires_at <= $2
             )
             DELETE FROM github_installation_states
             WHERE state_hash = $1 AND kind = 'oauth' AND expires_at > $2
              RETURNING workspace_id, initiated_by, installation_id, return_page_id",
        )
        .bind(state_hash)
        .bind(now)
        .fetch_optional(&self.pool)
        .await
        .map(|pending| {
            pending.map(
                |(workspace_id, initiated_by, installation_id, return_page_id)| {
                    PendingGitHubInstallation {
                        workspace_id,
                        initiated_by,
                        installation_id,
                        return_page_id,
                    }
                },
            )
        })
        .map_err(map_sqlx_error)
    }

    async fn save_installation(
        &self,
        pending: PendingGitHubInstallation,
        installation: GitHubInstallationSnapshot,
        now: chrono::DateTime<chrono::Utc>,
    ) -> Result<GitHubInstallation, RepositoryError> {
        let mut tx = self.pool.begin().await.map_err(map_sqlx_error)?;
        sqlx::query(
            "DELETE FROM github_pr_links links
             USING github_installations installation
             WHERE links.workspace_id = $1
               AND installation.workspace_id = links.workspace_id
               AND installation.installation_id <> $2",
        )
        .bind(pending.workspace_id)
        .bind(installation.installation_id)
        .execute(&mut *tx)
        .await
        .map_err(map_sqlx_error)?;

        let row = sqlx::query_as::<_, InstallationRow>(
            "INSERT INTO github_installations
                (id, workspace_id, installation_id, account_login, account_type,
                  installed_by, created_at, updated_at)
             SELECT $1, member.workspace_id, $3, $4, $5, member.user_id, $7, $7
             FROM workspace_members member
             WHERE member.workspace_id = $2 AND member.user_id = $6 AND member.role = 'owner'
             ON CONFLICT (workspace_id) DO UPDATE SET
                  installation_id = EXCLUDED.installation_id,
                 account_login = EXCLUDED.account_login,
                 account_type = EXCLUDED.account_type,
                 installed_by = EXCLUDED.installed_by,
                 updated_at = EXCLUDED.updated_at
             RETURNING id, workspace_id, installation_id, account_login, account_type,
                       created_at, updated_at",
        )
        .bind(Uuid::new_v4())
        .bind(pending.workspace_id)
        .bind(installation.installation_id)
        .bind(installation.account_login)
        .bind(installation.account_type)
        .bind(pending.initiated_by)
        .bind(now)
        .fetch_optional(&mut *tx)
        .await
        .map_err(map_sqlx_error)?;
        let Some(row) = row else {
            tx.rollback().await.map_err(map_sqlx_error)?;
            return Err(DomainError::Forbidden.into());
        };
        tx.commit().await.map_err(map_sqlx_error)?;
        Ok(row.into())
    }

    async fn list_installations(
        &self,
        workspace_id: Uuid,
    ) -> Result<Vec<GitHubInstallation>, RepositoryError> {
        sqlx::query_as::<_, InstallationRow>(
            "SELECT id, workspace_id, installation_id, account_login, account_type,
                    created_at, updated_at
             FROM github_installations WHERE workspace_id = $1 ORDER BY created_at",
        )
        .bind(workspace_id)
        .fetch_all(&self.pool)
        .await
        .map(|rows| rows.into_iter().map(Into::into).collect())
        .map_err(map_sqlx_error)
    }

    async fn find_installation(
        &self,
        workspace_id: Uuid,
    ) -> Result<Option<GitHubInstallation>, RepositoryError> {
        sqlx::query_as::<_, InstallationRow>(
            "SELECT id, workspace_id, installation_id, account_login, account_type,
                    created_at, updated_at
             FROM github_installations WHERE workspace_id = $1",
        )
        .bind(workspace_id)
        .fetch_optional(&self.pool)
        .await
        .map(|row| row.map(Into::into))
        .map_err(map_sqlx_error)
    }

    async fn validate_pull_request_link_target(
        &self,
        workspace_id: Uuid,
        block_id: Uuid,
    ) -> Result<(), RepositoryError> {
        let valid = sqlx::query_scalar::<_, bool>(
            "SELECT EXISTS (
                 SELECT 1 FROM blocks
                 WHERE id = $1 AND workspace_id = $2
                   AND type IN ('page', 'database_row') AND trashed_at IS NULL
             )",
        )
        .bind(block_id)
        .bind(workspace_id)
        .fetch_one(&self.pool)
        .await
        .map_err(map_sqlx_error)?;
        if valid {
            Ok(())
        } else {
            Err(DomainError::Validation(INVALID_LINK_BLOCK).into())
        }
    }

    async fn save_pull_request_link(
        &self,
        input: SavePullRequestLink,
    ) -> Result<GitHubPullRequestLink, RepositoryError> {
        let mut tx = self.pool.begin().await.map_err(map_sqlx_error)?;
        validate_link_block(&mut tx, input.workspace_id, input.block_id).await?;
        let installation_id = sqlx::query_scalar::<_, Uuid>(
            "SELECT id FROM github_installations WHERE workspace_id = $1",
        )
        .bind(input.workspace_id)
        .fetch_optional(&mut *tx)
        .await
        .map_err(map_sqlx_error)?
        .ok_or(RepositoryError::NotFound)?;

        let link = sqlx::query_as::<_, PullRequestLinkRow>(
            "INSERT INTO github_pr_links
                (id, workspace_id, block_id, github_installation_id, owner, repository,
                 pull_number, url, title, body, state, draft, author_login, head_sha,
                 base_ref, head_ref, additions, deletions, changed_files, linked_by,
                 created_at, updated_at)
              VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14,
                      $15, $16, $17, $18, $19, $20, $21, $21)
              ON CONFLICT (workspace_id, block_id) DO UPDATE SET
                 github_installation_id = EXCLUDED.github_installation_id,
                 owner = EXCLUDED.owner,
                 repository = EXCLUDED.repository,
                 pull_number = EXCLUDED.pull_number,
                  url = EXCLUDED.url,
                  title = EXCLUDED.title,
                  body = EXCLUDED.body,
                  state = EXCLUDED.state,
                  draft = EXCLUDED.draft,
                  author_login = EXCLUDED.author_login,
                  head_sha = EXCLUDED.head_sha,
                  base_ref = EXCLUDED.base_ref,
                  head_ref = EXCLUDED.head_ref,
                  additions = EXCLUDED.additions,
                  deletions = EXCLUDED.deletions,
                  changed_files = EXCLUDED.changed_files,
                  linked_by = EXCLUDED.linked_by,
                  updated_at = EXCLUDED.updated_at
              RETURNING id, workspace_id, block_id, owner, repository, pull_number, url,
                        title, body, state, draft, author_login, head_sha, base_ref, head_ref,
                        additions, deletions, changed_files, created_at, updated_at",
        )
        .bind(input.id)
        .bind(input.workspace_id)
        .bind(input.block_id)
        .bind(installation_id)
        .bind(input.pull_request.owner)
        .bind(input.pull_request.repository)
        .bind(input.pull_request.number)
        .bind(input.snapshot.url)
        .bind(input.snapshot.title)
        .bind(input.snapshot.body)
        .bind(input.snapshot.state)
        .bind(input.snapshot.draft)
        .bind(input.snapshot.author_login)
        .bind(input.snapshot.head_sha)
        .bind(input.snapshot.base_ref)
        .bind(input.snapshot.head_ref)
        .bind(input.snapshot.additions)
        .bind(input.snapshot.deletions)
        .bind(input.snapshot.changed_files)
        .bind(input.linked_by)
        .bind(input.now)
        .fetch_one(&mut *tx)
        .await
        .map_err(map_sqlx_error)?;
        tx.commit().await.map_err(map_sqlx_error)?;
        Ok(link.into())
    }

    async fn list_pull_request_links(
        &self,
        workspace_id: Uuid,
    ) -> Result<Vec<GitHubPullRequestLink>, RepositoryError> {
        sqlx::query_as::<_, PullRequestLinkRow>(
            "SELECT id, workspace_id, block_id, owner, repository, pull_number, url,
                     title, body, state, draft, author_login, head_sha, base_ref, head_ref,
                     additions, deletions, changed_files, created_at, updated_at
              FROM github_pr_links WHERE workspace_id = $1 ORDER BY updated_at DESC",
        )
        .bind(workspace_id)
        .fetch_all(&self.pool)
        .await
        .map(|rows| rows.into_iter().map(Into::into).collect())
        .map_err(map_sqlx_error)
    }

    async fn find_pull_request_link(
        &self,
        workspace_id: Uuid,
        block_id: Uuid,
    ) -> Result<Option<GitHubPullRequestLinkContext>, RepositoryError> {
        sqlx::query_as::<_, PullRequestLinkContextRow>(
            "SELECT l.id, l.workspace_id, l.block_id, l.owner, l.repository, l.pull_number,
                    l.url, l.title, l.body, l.state, l.draft, l.author_login, l.head_sha,
                    l.base_ref, l.head_ref, l.additions, l.deletions, l.changed_files,
                    l.created_at, l.updated_at, i.installation_id
             FROM github_pr_links l
             JOIN github_installations i
               ON i.id = l.github_installation_id AND i.workspace_id = l.workspace_id
             WHERE l.workspace_id = $1 AND l.block_id = $2",
        )
        .bind(workspace_id)
        .bind(block_id)
        .fetch_optional(&self.pool)
        .await
        .map(|row| {
            row.map(|row| GitHubPullRequestLinkContext {
                link: row.link.into(),
                installation_id: row.installation_id,
            })
        })
        .map_err(map_sqlx_error)
    }

    async fn delete_pull_request_link(
        &self,
        workspace_id: Uuid,
        block_id: Uuid,
    ) -> Result<(), RepositoryError> {
        sqlx::query("DELETE FROM github_pr_links WHERE workspace_id = $1 AND block_id = $2")
            .bind(workspace_id)
            .bind(block_id)
            .execute(&self.pool)
            .await
            .map_err(map_sqlx_error)?;
        Ok(())
    }
}
