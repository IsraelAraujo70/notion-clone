pub mod auth;
pub mod clock;
pub mod email;
pub mod workspace;

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum RepositoryError {
    DuplicateEmail,
    NotFound,
    Unexpected,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum EmailError {
    Unexpected,
}
