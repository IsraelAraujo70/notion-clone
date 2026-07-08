pub mod auth;
pub mod clock;
pub mod email;
pub mod page;
pub mod workspace;

use crate::domain::error::DomainError;

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum RepositoryError {
    DuplicateEmail,
    NotFound,
    /// Regra de domínio violada dentro da transação (ex.: op inválida no apply).
    Domain(DomainError),
    Unexpected,
}

impl From<DomainError> for RepositoryError {
    fn from(error: DomainError) -> Self {
        Self::Domain(error)
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum EmailError {
    Unexpected,
}
