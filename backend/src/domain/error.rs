#[derive(Debug, Clone, PartialEq, Eq)]
pub enum DomainError {
    Validation(&'static str),
    EmailTaken,
    InvalidCredentials,
    Unauthorized,
    UserNotFound,
    PageNotFound,
    Forbidden,
    AlreadyMember,
}
