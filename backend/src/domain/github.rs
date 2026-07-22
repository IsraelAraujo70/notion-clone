use url::Url;

use crate::domain::error::DomainError;

const INVALID_PULL_REQUEST_URL: &str =
    "GitHub pull request URL must match https://github.com/{owner}/{repo}/pull/{number}";

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct GitHubPullRequestRef {
    pub owner: String,
    pub repository: String,
    pub number: i64,
}

pub fn parse_pull_request_url(value: &str) -> Result<GitHubPullRequestRef, DomainError> {
    let url = Url::parse(value).map_err(|_| DomainError::Validation(INVALID_PULL_REQUEST_URL))?;
    if url.scheme() != "https"
        || url.host_str() != Some("github.com")
        || url.port().is_some()
        || !url.username().is_empty()
        || url.password().is_some()
        || url.query().is_some()
        || url.fragment().is_some()
    {
        return Err(DomainError::Validation(INVALID_PULL_REQUEST_URL));
    }

    let segments = url
        .path_segments()
        .ok_or(DomainError::Validation(INVALID_PULL_REQUEST_URL))?
        .collect::<Vec<_>>();
    if segments.len() != 4
        || !valid_owner(segments[0])
        || !valid_repository(segments[1])
        || segments[2] != "pull"
    {
        return Err(DomainError::Validation(INVALID_PULL_REQUEST_URL));
    }
    let number = segments[3]
        .parse::<i64>()
        .ok()
        .filter(|number| *number > 0)
        .ok_or(DomainError::Validation(INVALID_PULL_REQUEST_URL))?;
    if segments[3] != number.to_string() {
        return Err(DomainError::Validation(INVALID_PULL_REQUEST_URL));
    }

    Ok(GitHubPullRequestRef {
        owner: segments[0].to_string(),
        repository: segments[1].to_string(),
        number,
    })
}

fn valid_owner(value: &str) -> bool {
    !value.is_empty()
        && value.len() <= 39
        && value
            .bytes()
            .all(|byte| byte.is_ascii_alphanumeric() || byte == b'-')
        && value
            .as_bytes()
            .first()
            .is_some_and(u8::is_ascii_alphanumeric)
        && value
            .as_bytes()
            .last()
            .is_some_and(u8::is_ascii_alphanumeric)
}

fn valid_repository(value: &str) -> bool {
    !value.is_empty()
        && value.len() <= 100
        && value != "."
        && value != ".."
        && value
            .bytes()
            .all(|byte| byte.is_ascii_alphanumeric() || matches!(byte, b'-' | b'_' | b'.'))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_canonical_pull_request_url() {
        assert_eq!(
            parse_pull_request_url("https://github.com/acme/reason/pull/42").unwrap(),
            GitHubPullRequestRef {
                owner: "acme".into(),
                repository: "reason".into(),
                number: 42,
            }
        );
    }

    #[test]
    fn rejects_non_canonical_pull_request_urls() {
        for value in [
            "http://github.com/acme/reason/pull/42",
            "https://www.github.com/acme/reason/pull/42",
            "https://github.com/acme/reason/pull/42/",
            "https://github.com/acme/reason/pull/42?diff=split",
            "https://github.com/acme/reason/pull/0",
            "https://github.com/acme/reason/pull/042",
            "https://github.com/acme/reason/issues/42",
            "https://github.com/acme%2Fresearch/reason/pull/42",
            "https://github.com/acme/reason%2Fapi/pull/42",
        ] {
            assert!(parse_pull_request_url(value).is_err(), "accepted {value}");
        }
    }
}
