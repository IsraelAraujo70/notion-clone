pub mod auth;
pub mod pages;
pub mod ports;
pub mod realtime;
pub mod workspaces;

use crate::application::ports::EmailError;
use crate::application::ports::RepositoryError;
use crate::domain::error::DomainError;

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum AppError {
    Domain(DomainError),
    DuplicateEmail,
    AlreadyMember,
    InvalidCredentials,
    Unauthorized,
    Forbidden,
    Repository,
    Email,
    Internal,
}

impl From<DomainError> for AppError {
    fn from(error: DomainError) -> Self {
        match error {
            DomainError::EmailTaken => Self::DuplicateEmail,
            DomainError::InvalidCredentials => Self::InvalidCredentials,
            DomainError::Unauthorized => Self::Unauthorized,
            DomainError::Forbidden => Self::Forbidden,
            DomainError::AlreadyMember => Self::AlreadyMember,
            other => Self::Domain(other),
        }
    }
}

impl From<RepositoryError> for AppError {
    fn from(error: RepositoryError) -> Self {
        match error {
            RepositoryError::DuplicateEmail => Self::DuplicateEmail,
            RepositoryError::NotFound => Self::Domain(DomainError::UserNotFound),
            RepositoryError::Domain(domain) => domain.into(),
            RepositoryError::Unexpected => Self::Repository,
        }
    }
}

impl From<EmailError> for AppError {
    fn from(_: EmailError) -> Self {
        Self::Email
    }
}

#[cfg(test)]
mod tests;
