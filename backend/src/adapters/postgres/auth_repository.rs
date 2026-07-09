use async_trait::async_trait;
use chrono::{DateTime, Utc};
use sqlx::PgPool;
use uuid::Uuid;

use crate::adapters::postgres::page_repository::create_workspace_root_page;
use crate::adapters::postgres::tx::map_sqlx_error;
use crate::application::ports::RepositoryError;
use crate::application::ports::auth::{
    AuthRepository, CreateUserRecord, CreateUserWithDefaultWorkspaceRecord,
};
use crate::domain::auth::{User, UserWithPassword};
use crate::domain::workspace::Workspace;

const USER_COLUMNS: &str = "id, email, display_name, avatar_key, created_at";

#[derive(Debug, Clone)]
pub struct PostgresAuthRepository {
    pool: PgPool,
}

impl PostgresAuthRepository {
    pub fn new(pool: PgPool) -> Self {
        Self { pool }
    }
}

#[derive(sqlx::FromRow)]
struct UserRow {
    id: Uuid,
    email: String,
    display_name: String,
    avatar_key: Option<String>,
    created_at: DateTime<Utc>,
}

impl From<UserRow> for User {
    fn from(row: UserRow) -> Self {
        Self {
            id: row.id,
            email: row.email,
            display_name: row.display_name,
            avatar_key: row.avatar_key,
            avatar_url: None,
            created_at: row.created_at,
        }
    }
}

#[derive(sqlx::FromRow)]
struct UserWithPasswordRow {
    id: Uuid,
    email: String,
    display_name: String,
    avatar_key: Option<String>,
    created_at: DateTime<Utc>,
    password_hash: String,
}

impl From<UserWithPasswordRow> for UserWithPassword {
    fn from(row: UserWithPasswordRow) -> Self {
        Self {
            user: User {
                id: row.id,
                email: row.email,
                display_name: row.display_name,
                avatar_key: row.avatar_key,
                avatar_url: None,
                created_at: row.created_at,
            },
            password_hash: row.password_hash,
        }
    }
}

#[derive(sqlx::FromRow)]
struct WorkspaceRow {
    id: Uuid,
    name: String,
    created_at: DateTime<Utc>,
}

impl From<WorkspaceRow> for Workspace {
    fn from(row: WorkspaceRow) -> Self {
        Self {
            id: row.id,
            name: row.name,
            created_at: row.created_at,
        }
    }
}

#[async_trait]
impl AuthRepository for PostgresAuthRepository {
    async fn create_user(&self, input: CreateUserRecord) -> Result<User, RepositoryError> {
        let query = format!(
            "INSERT INTO users (email, password_hash, display_name) VALUES ($1, $2, $3) RETURNING {USER_COLUMNS}"
        );
        match sqlx::query_as::<_, UserRow>(&query)
            .bind(&input.email)
            .bind(&input.password_hash)
            .bind(&input.display_name)
            .fetch_one(&self.pool)
            .await
        {
            Ok(user) => Ok(user.into()),
            Err(sqlx::Error::Database(db)) if db.is_unique_violation() => {
                Err(RepositoryError::DuplicateEmail)
            }
            Err(error) => Err(map_sqlx_error(error)),
        }
    }

    async fn create_user_with_default_workspace(
        &self,
        input: CreateUserWithDefaultWorkspaceRecord,
    ) -> Result<(User, Workspace), RepositoryError> {
        let mut tx = self.pool.begin().await.map_err(map_sqlx_error)?;
        let user_query = format!(
            "INSERT INTO users (email, password_hash, display_name) VALUES ($1, $2, $3) RETURNING {USER_COLUMNS}"
        );
        let user = match sqlx::query_as::<_, UserRow>(&user_query)
            .bind(&input.email)
            .bind(&input.password_hash)
            .bind(&input.display_name)
            .fetch_one(&mut *tx)
            .await
        {
            Ok(user) => user,
            Err(sqlx::Error::Database(db)) if db.is_unique_violation() => {
                tx.rollback().await.map_err(map_sqlx_error)?;
                return Err(RepositoryError::DuplicateEmail);
            }
            Err(error) => {
                tx.rollback().await.map_err(map_sqlx_error)?;
                return Err(map_sqlx_error(error));
            }
        };

        let workspace = sqlx::query_as::<_, WorkspaceRow>(
            "WITH workspace AS (
                 INSERT INTO workspaces (name, created_by)
                 VALUES ($1, $2)
                 RETURNING id, name, created_at
             ), membership AS (
                 INSERT INTO workspace_members (workspace_id, user_id, role)
                 SELECT id, $2, 'owner' FROM workspace
             )
             SELECT id, name, created_at FROM workspace",
        )
        .bind(&input.workspace_name)
        .bind(user.id)
        .fetch_one(&mut *tx)
        .await
        .map_err(map_sqlx_error)?;

        create_workspace_root_page(&mut tx, workspace.id, user.id)
            .await
            .map_err(map_sqlx_error)?;

        tx.commit().await.map_err(map_sqlx_error)?;
        Ok((user.into(), workspace.into()))
    }

    async fn find_user_with_password_by_email(
        &self,
        email: &str,
    ) -> Result<Option<UserWithPassword>, RepositoryError> {
        let query = format!("SELECT {USER_COLUMNS}, password_hash FROM users WHERE email = $1");
        sqlx::query_as::<_, UserWithPasswordRow>(&query)
            .bind(email)
            .fetch_optional(&self.pool)
            .await
            .map(|row| row.map(Into::into))
            .map_err(map_sqlx_error)
    }

    async fn find_user_by_email(&self, email: &str) -> Result<Option<User>, RepositoryError> {
        let query = format!("SELECT {USER_COLUMNS} FROM users WHERE email = $1");
        sqlx::query_as::<_, UserRow>(&query)
            .bind(email)
            .fetch_optional(&self.pool)
            .await
            .map(|row| row.map(Into::into))
            .map_err(map_sqlx_error)
    }

    async fn create_session(
        &self,
        user_id: Uuid,
        token_hash: &str,
        expires_at: DateTime<Utc>,
    ) -> Result<(), RepositoryError> {
        sqlx::query("INSERT INTO sessions (token_hash, user_id, expires_at) VALUES ($1, $2, $3)")
            .bind(token_hash)
            .bind(user_id)
            .bind(expires_at)
            .execute(&self.pool)
            .await
            .map(|_| ())
            .map_err(map_sqlx_error)
    }

    async fn find_user_by_session_hash(
        &self,
        token_hash: &str,
        now: DateTime<Utc>,
    ) -> Result<Option<User>, RepositoryError> {
        let query = format!(
            "SELECT {} FROM sessions s JOIN users u ON u.id = s.user_id \
             WHERE s.token_hash = $1 AND s.expires_at > $2",
            USER_COLUMNS
                .split(", ")
                .map(|column| format!("u.{column}"))
                .collect::<Vec<_>>()
                .join(", ")
        );
        sqlx::query_as::<_, UserRow>(&query)
            .bind(token_hash)
            .bind(now)
            .fetch_optional(&self.pool)
            .await
            .map(|row| row.map(Into::into))
            .map_err(map_sqlx_error)
    }

    async fn delete_session(&self, token_hash: &str) -> Result<(), RepositoryError> {
        sqlx::query("DELETE FROM sessions WHERE token_hash = $1")
            .bind(token_hash)
            .execute(&self.pool)
            .await
            .map(|_| ())
            .map_err(map_sqlx_error)
    }

    async fn create_password_reset_token(
        &self,
        user_id: Uuid,
        token_hash: &str,
        expires_at: DateTime<Utc>,
    ) -> Result<(), RepositoryError> {
        let mut tx = self.pool.begin().await.map_err(map_sqlx_error)?;
        sqlx::query(
            "UPDATE password_reset_tokens SET used_at = now() \
             WHERE user_id = $1 AND used_at IS NULL",
        )
        .bind(user_id)
        .execute(&mut *tx)
        .await
        .map_err(map_sqlx_error)?;

        sqlx::query(
            "INSERT INTO password_reset_tokens (user_id, token_hash, expires_at) \
             VALUES ($1, $2, $3)",
        )
        .bind(user_id)
        .bind(token_hash)
        .bind(expires_at)
        .execute(&mut *tx)
        .await
        .map_err(map_sqlx_error)?;

        tx.commit().await.map_err(map_sqlx_error)
    }

    async fn reset_password_with_token(
        &self,
        token_hash: &str,
        now: DateTime<Utc>,
        password_hash: &str,
    ) -> Result<bool, RepositoryError> {
        let mut tx = self.pool.begin().await.map_err(map_sqlx_error)?;
        let reset = sqlx::query_as::<_, (Uuid, Uuid)>(
            "SELECT id, user_id FROM password_reset_tokens \
             WHERE token_hash = $1 AND expires_at > $2 AND used_at IS NULL \
             FOR UPDATE",
        )
        .bind(token_hash)
        .bind(now)
        .fetch_optional(&mut *tx)
        .await
        .map_err(map_sqlx_error)?;

        let Some((reset_id, user_id)) = reset else {
            tx.rollback().await.map_err(map_sqlx_error)?;
            return Ok(false);
        };

        sqlx::query("UPDATE users SET password_hash = $1 WHERE id = $2")
            .bind(password_hash)
            .bind(user_id)
            .execute(&mut *tx)
            .await
            .map_err(map_sqlx_error)?;

        sqlx::query("UPDATE password_reset_tokens SET used_at = $1 WHERE id = $2")
            .bind(now)
            .bind(reset_id)
            .execute(&mut *tx)
            .await
            .map_err(map_sqlx_error)?;

        sqlx::query("DELETE FROM sessions WHERE user_id = $1")
            .bind(user_id)
            .execute(&mut *tx)
            .await
            .map_err(map_sqlx_error)?;

        tx.commit().await.map_err(map_sqlx_error)?;
        Ok(true)
    }

    async fn update_password_and_delete_other_sessions(
        &self,
        user_id: Uuid,
        password_hash: &str,
        current_token_hash: &str,
    ) -> Result<(), RepositoryError> {
        let mut tx = self.pool.begin().await.map_err(map_sqlx_error)?;
        sqlx::query("UPDATE users SET password_hash = $1 WHERE id = $2")
            .bind(password_hash)
            .bind(user_id)
            .execute(&mut *tx)
            .await
            .map_err(map_sqlx_error)?;

        sqlx::query("DELETE FROM sessions WHERE user_id = $1 AND token_hash <> $2")
            .bind(user_id)
            .bind(current_token_hash)
            .execute(&mut *tx)
            .await
            .map_err(map_sqlx_error)?;

        tx.commit().await.map_err(map_sqlx_error)
    }

    async fn update_profile(
        &self,
        user_id: Uuid,
        display_name: Option<String>,
        avatar_key: Option<Option<String>>,
    ) -> Result<User, RepositoryError> {
        let query = format!(
            "UPDATE users SET
                 display_name = COALESCE($2, display_name),
                 avatar_key = CASE WHEN $3::boolean THEN $4 ELSE avatar_key END
             WHERE id = $1
             RETURNING {USER_COLUMNS}"
        );
        let set_avatar = avatar_key.is_some();
        let avatar_value = avatar_key.flatten();
        sqlx::query_as::<_, UserRow>(&query)
            .bind(user_id)
            .bind(display_name)
            .bind(set_avatar)
            .bind(avatar_value)
            .fetch_optional(&self.pool)
            .await
            .map_err(map_sqlx_error)?
            .map(Into::into)
            .ok_or(RepositoryError::NotFound)
    }

    async fn find_user_by_id(&self, user_id: Uuid) -> Result<Option<User>, RepositoryError> {
        let query = format!("SELECT {USER_COLUMNS} FROM users WHERE id = $1");
        sqlx::query_as::<_, UserRow>(&query)
            .bind(user_id)
            .fetch_optional(&self.pool)
            .await
            .map(|row| row.map(Into::into))
            .map_err(map_sqlx_error)
    }
}
