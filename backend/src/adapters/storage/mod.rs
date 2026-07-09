use async_trait::async_trait;
use chrono::Utc;
use hmac::{Hmac, Mac};
use sha2::{Digest, Sha256};
use uuid::Uuid;

use crate::application::ports::storage::{ObjectStorage, PresignedUpload};
use crate::application::ports::StorageError;

type HmacSha256 = Hmac<Sha256>;

/// Espelha o drive-clone: endpoint interno (opcional) + public endpoint pro browser.
#[derive(Debug, Clone)]
pub struct S3Config {
    /// Base usada nas URLs assinadas (browser). Ex: http://localhost:9000
    pub public_endpoint: String,
    pub region: String,
    pub bucket: String,
    pub access_key: String,
    pub secret_key: String,
    /// Prefixo público das URLs de leitura. Ex: http://localhost:9000/avatars
    pub public_base_url: String,
    pub force_path_style: bool,
}

#[derive(Debug, Clone)]
pub struct S3ObjectStorage {
    config: S3Config,
}

impl S3ObjectStorage {
    pub fn new(config: S3Config) -> Self {
        Self { config }
    }

    fn host(&self) -> String {
        self.config
            .public_endpoint
            .trim_start_matches("https://")
            .trim_start_matches("http://")
            .trim_end_matches('/')
            .to_string()
    }
}

#[async_trait]
impl ObjectStorage for S3ObjectStorage {
    fn is_configured(&self) -> bool {
        true
    }

    fn public_url(&self, key: &str) -> Option<String> {
        let base = self.config.public_base_url.trim_end_matches('/');
        Some(format!("{base}/{key}"))
    }

    async fn presign_put(
        &self,
        key: &str,
        content_type: &str,
        _max_bytes: u64,
    ) -> Result<PresignedUpload, StorageError> {
        let amz_date = Utc::now().format("%Y%m%dT%H%M%SZ").to_string();
        let date_stamp = &amz_date[..8];
        let credential_scope = format!(
            "{}/{}/s3/aws4_request",
            date_stamp, self.config.region
        );
        let credential = format!("{}/{}", self.config.access_key, credential_scope);

        let host = if self.config.force_path_style {
            self.host()
        } else {
            format!("{}.{}", self.config.bucket, self.host())
        };

        let canonical_uri = if self.config.force_path_style {
            format!("/{}/{}", self.config.bucket, key)
        } else {
            format!("/{key}")
        };

        let signed_headers = "content-type;host";
        let algorithm = "AWS4-HMAC-SHA256";
        let expires = "300";

        let canonical_query = format!(
            "X-Amz-Algorithm={}&X-Amz-Credential={}&X-Amz-Date={}&X-Amz-Expires={}&X-Amz-SignedHeaders={}",
            algorithm,
            uri_encode(&credential),
            amz_date,
            expires,
            uri_encode(signed_headers),
        );

        let payload_hash = "UNSIGNED-PAYLOAD";
        let canonical_headers = format!("content-type:{content_type}\nhost:{host}\n");
        let canonical_request = format!(
            "PUT\n{canonical_uri}\n{canonical_query}\n{canonical_headers}\n{signed_headers}\n{payload_hash}"
        );

        let string_to_sign = format!(
            "{algorithm}\n{amz_date}\n{credential_scope}\n{}",
            hex_sha256(&canonical_request)
        );

        let signing_key = derive_signing_key(
            &self.config.secret_key,
            date_stamp,
            &self.config.region,
            "s3",
        );
        let signature = hex_hmac(&signing_key, string_to_sign.as_bytes());

        let scheme = if self.config.public_endpoint.starts_with("https") {
            "https"
        } else {
            "http"
        };
        let upload_url = format!(
            "{scheme}://{host}{canonical_uri}?{canonical_query}&X-Amz-Signature={signature}"
        );

        Ok(PresignedUpload {
            upload_url,
            key: key.to_string(),
            public_url: self.public_url(key).unwrap_or_default(),
            headers: vec![("Content-Type".to_string(), content_type.to_string())],
        })
    }
}

#[derive(Debug, Clone, Default)]
pub struct NoopObjectStorage;

#[async_trait]
impl ObjectStorage for NoopObjectStorage {
    fn is_configured(&self) -> bool {
        false
    }

    fn public_url(&self, _key: &str) -> Option<String> {
        None
    }

    async fn presign_put(
        &self,
        _key: &str,
        _content_type: &str,
        _max_bytes: u64,
    ) -> Result<PresignedUpload, StorageError> {
        Err(StorageError::NotConfigured)
    }
}

fn derive_signing_key(secret: &str, date: &str, region: &str, service: &str) -> Vec<u8> {
    let k_date = hmac_sha256(format!("AWS4{secret}").as_bytes(), date.as_bytes());
    let k_region = hmac_sha256(&k_date, region.as_bytes());
    let k_service = hmac_sha256(&k_region, service.as_bytes());
    hmac_sha256(&k_service, b"aws4_request")
}

fn hmac_sha256(key: &[u8], data: &[u8]) -> Vec<u8> {
    let mut mac = HmacSha256::new_from_slice(key).expect("HMAC key");
    mac.update(data);
    mac.finalize().into_bytes().to_vec()
}

fn hex_hmac(key: &[u8], data: &[u8]) -> String {
    hex::encode(hmac_sha256(key, data))
}

fn hex_sha256(data: &str) -> String {
    let mut hasher = Sha256::new();
    hasher.update(data.as_bytes());
    hex::encode(hasher.finalize())
}

fn uri_encode(value: &str) -> String {
    let mut out = String::with_capacity(value.len() * 3);
    for byte in value.bytes() {
        match byte {
            b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'-' | b'_' | b'.' | b'~' => {
                out.push(byte as char);
            }
            _ => {
                out.push('%');
                out.push_str(&format!("{byte:02X}"));
            }
        }
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn avatar_key_uses_user_prefix() {
        let storage = NoopObjectStorage;
        let user_id = Uuid::new_v4();
        let key = storage.avatar_key_for(user_id, "jpg");
        assert!(key.starts_with(&format!("{user_id}/")));
        assert!(key.ends_with(".jpg"));
    }
}
