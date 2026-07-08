use std::sync::Arc;

use uuid::Uuid;

use crate::application::AppError;
use crate::application::ports::auth::AuthRepository;
use crate::domain::auth::{hash_password, validate_password, verify_password};

#[derive(Debug, Clone)]
pub struct ChangePasswordInput {
    pub user_id: Uuid,
    pub email: String,
    pub current_token_hash: String,
    pub current_password: String,
    pub new_password: String,
}

#[derive(Clone)]
pub struct ChangePasswordUseCase {
    auth_repository: Arc<dyn AuthRepository>,
}

impl ChangePasswordUseCase {
    pub fn new(auth_repository: Arc<dyn AuthRepository>) -> Self {
        Self { auth_repository }
    }

    pub async fn execute(&self, input: ChangePasswordInput) -> Result<(), AppError> {
        validate_password(&input.new_password)?;
        let record = self
            .auth_repository
            .find_user_with_password_by_email(&input.email)
            .await?
            .filter(|record| record.user.id == input.user_id)
            .ok_or(AppError::Unauthorized)?;

        let current_password = input.current_password;
        let password_hash = record.password_hash;
        let verified =
            tokio::task::spawn_blocking(move || verify_password(&current_password, &password_hash))
                .await
                .map_err(|_| AppError::Internal)?;
        if !verified {
            return Err(AppError::InvalidCredentials);
        }

        let new_password = input.new_password;
        let new_password_hash = tokio::task::spawn_blocking(move || hash_password(&new_password))
            .await
            .map_err(|_| AppError::Internal)??;

        self.auth_repository
            .update_password_and_delete_other_sessions(
                input.user_id,
                &new_password_hash,
                &input.current_token_hash,
            )
            .await
            .map_err(Into::into)
    }
}
