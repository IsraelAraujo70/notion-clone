use async_trait::async_trait;
use chrono::Utc;
use futures_util::StreamExt;
use hmac::{Hmac, Mac};
use sha2::{Digest, Sha256};

use crate::application::ports::StorageError;
use crate::application::ports::storage::{ObjectStorage, PresignedUpload, StoredObject};

type HmacSha256 = Hmac<Sha256>;

/// Espelha o drive-clone: endpoint interno (opcional) + public endpoint pro browser.
#[derive(Debug, Clone)]
pub struct S3Config {
    /// Endpoint reachable by backend services. Ex: http://minio:9000
    pub endpoint: String,
    /// Base usada nas URLs assinadas pelo browser. Ex: http://localhost:9000
    pub public_endpoint: String,
    pub region: String,
    pub bucket: String,
    pub access_key: String,
    pub secret_key: String,
    /// Prefixo público das URLs de leitura. Ex: http://localhost:9000/media
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

    fn endpoint_host(endpoint: &str) -> String {
        endpoint
            .trim_start_matches("https://")
            .trim_start_matches("http://")
            .trim_end_matches('/')
            .to_string()
    }

    fn public_host(&self) -> String {
        Self::endpoint_host(&self.config.public_endpoint)
    }

    fn internal_host(&self) -> String {
        Self::endpoint_host(&self.config.endpoint)
    }

    fn object_uri(&self, key: &str) -> String {
        let encoded_key = key.split('/').map(uri_encode).collect::<Vec<_>>().join("/");
        if self.config.force_path_style {
            format!("/{}/{encoded_key}", uri_encode(&self.config.bucket))
        } else {
            format!("/{encoded_key}")
        }
    }

    fn presigned_get_url(&self, key: &str, public: bool) -> String {
        let amz_date = Utc::now().format("%Y%m%dT%H%M%SZ").to_string();
        let date_stamp = &amz_date[..8];
        let credential_scope = format!("{}/{}/s3/aws4_request", date_stamp, self.config.region);
        let credential = format!("{}/{}", self.config.access_key, credential_scope);
        let endpoint = if public {
            &self.config.public_endpoint
        } else {
            &self.config.endpoint
        };
        let endpoint_host = Self::endpoint_host(endpoint);
        let host = if self.config.force_path_style {
            endpoint_host
        } else {
            format!("{}.{}", self.config.bucket, endpoint_host)
        };
        let canonical_uri = self.object_uri(key);
        let signed_headers = "host";
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
        let canonical_headers = format!("host:{host}\n");
        let canonical_request = format!(
            "GET\n{canonical_uri}\n{canonical_query}\n{canonical_headers}\n{signed_headers}\nUNSIGNED-PAYLOAD"
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
        let scheme = if endpoint.starts_with("https") {
            "https"
        } else {
            "http"
        };
        format!("{scheme}://{host}{canonical_uri}?{canonical_query}&X-Amz-Signature={signature}")
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
        let credential_scope = format!("{}/{}/s3/aws4_request", date_stamp, self.config.region);
        let credential = format!("{}/{}", self.config.access_key, credential_scope);

        let host = if self.config.force_path_style {
            self.public_host()
        } else {
            format!("{}.{}", self.config.bucket, self.public_host())
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

    async fn presign_get(&self, key: &str) -> Result<String, StorageError> {
        Ok(self.presigned_get_url(key, true))
    }

    async fn get_object(&self, key: &str, max_bytes: u64) -> Result<StoredObject, StorageError> {
        let url = self.presigned_get_url(key, false);
        let response = reqwest::Client::new()
            .get(url)
            .send()
            .await
            .map_err(|_| StorageError::Unexpected)?;
        if !response.status().is_success()
            || response
                .content_length()
                .is_some_and(|size| size > max_bytes)
        {
            return Err(StorageError::Unexpected);
        }
        let content_type = response
            .headers()
            .get(reqwest::header::CONTENT_TYPE)
            .and_then(|value| value.to_str().ok())
            .unwrap_or("application/octet-stream")
            .to_string();
        let mut bytes = Vec::with_capacity(
            response.content_length().unwrap_or_default().min(max_bytes) as usize,
        );
        let mut stream = response.bytes_stream();
        while let Some(chunk) = stream.next().await {
            let chunk = chunk.map_err(|_| StorageError::Unexpected)?;
            if bytes.len().saturating_add(chunk.len()) as u64 > max_bytes {
                return Err(StorageError::Unexpected);
            }
            bytes.extend_from_slice(&chunk);
        }
        Ok(StoredObject {
            bytes,
            content_type,
        })
    }

    async fn delete_object(&self, key: &str) -> Result<(), StorageError> {
        let amz_date = Utc::now().format("%Y%m%dT%H%M%SZ").to_string();
        let date_stamp = &amz_date[..8];
        let credential_scope = format!("{}/{}/s3/aws4_request", date_stamp, self.config.region);
        let credential = format!("{}/{}", self.config.access_key, credential_scope);
        let host = if self.config.force_path_style {
            self.internal_host()
        } else {
            format!("{}.{}", self.config.bucket, self.internal_host())
        };
        let canonical_uri = self.object_uri(key);
        let payload_hash = hex_sha256("");
        let signed_headers = "host;x-amz-content-sha256;x-amz-date";
        let canonical_headers =
            format!("host:{host}\nx-amz-content-sha256:{payload_hash}\nx-amz-date:{amz_date}\n");
        let canonical_request = format!(
            "DELETE\n{canonical_uri}\n\n{canonical_headers}\n{signed_headers}\n{payload_hash}"
        );
        let algorithm = "AWS4-HMAC-SHA256";
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
        let authorization = format!(
            "{algorithm} Credential={credential}, SignedHeaders={signed_headers}, Signature={signature}"
        );
        let scheme = if self.config.endpoint.starts_with("https") {
            "https"
        } else {
            "http"
        };
        let url = format!("{scheme}://{host}{canonical_uri}");

        let response = reqwest::Client::new()
            .delete(url)
            .header("x-amz-content-sha256", payload_hash)
            .header("x-amz-date", amz_date)
            .header("authorization", authorization)
            .send()
            .await
            .map_err(|_| StorageError::Unexpected)?;

        if response.status().is_success() || response.status() == reqwest::StatusCode::NOT_FOUND {
            Ok(())
        } else {
            Err(StorageError::Unexpected)
        }
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

    async fn presign_get(&self, _key: &str) -> Result<String, StorageError> {
        Err(StorageError::NotConfigured)
    }

    async fn get_object(&self, _key: &str, _max_bytes: u64) -> Result<StoredObject, StorageError> {
        Err(StorageError::NotConfigured)
    }

    async fn delete_object(&self, _key: &str) -> Result<(), StorageError> {
        Ok(())
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
    use axum::{
        Router,
        body::{Body, Bytes},
        extract::Request,
        http::StatusCode,
        routing::{delete, get},
    };
    use std::sync::Arc;
    use tokio::sync::Mutex;
    use uuid::Uuid;

    #[test]
    fn avatar_key_uses_user_prefix() {
        let storage = NoopObjectStorage;
        let user_id = Uuid::new_v4();
        let key = storage.avatar_key_for(user_id, "jpg");
        assert!(key.starts_with(&format!("{user_id}/")));
        assert!(key.ends_with(".jpg"));
    }

    #[tokio::test]
    async fn noop_delete_is_idempotent() {
        let storage = NoopObjectStorage;
        storage.delete_object("missing/object.png").await.unwrap();
    }

    #[tokio::test]
    async fn s3_delete_signs_and_sends_the_expected_request() {
        let request = Arc::new(Mutex::new(None));
        let captured = Arc::clone(&request);
        let app = Router::new().route(
            "/{*path}",
            delete(move |request: Request| {
                let captured = Arc::clone(&captured);
                async move {
                    let authorization = request
                        .headers()
                        .get("authorization")
                        .and_then(|value| value.to_str().ok())
                        .unwrap_or_default()
                        .to_string();
                    *captured.lock().await =
                        Some((request.uri().path().to_string(), authorization));
                    StatusCode::NO_CONTENT
                }
            }),
        );
        let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
        let address = listener.local_addr().unwrap();
        tokio::spawn(async move { axum::serve(listener, app).await.unwrap() });
        let storage = S3ObjectStorage::new(S3Config {
            endpoint: format!("http://{address}"),
            public_endpoint: format!("http://{address}"),
            region: "us-east-1".to_string(),
            bucket: "media".to_string(),
            access_key: "access".to_string(),
            secret_key: "secret".to_string(),
            public_base_url: format!("http://{address}/media"),
            force_path_style: true,
        });

        storage
            .delete_object("images/workspace/image one.png")
            .await
            .unwrap();

        let (path, authorization) = request.lock().await.clone().unwrap();
        assert_eq!(path, "/media/images/workspace/image%20one.png");
        assert!(authorization.starts_with("AWS4-HMAC-SHA256 Credential=access/"));
        assert!(authorization.contains("SignedHeaders=host;x-amz-content-sha256;x-amz-date"));
    }

    #[tokio::test]
    async fn s3_delete_accepts_missing_objects_but_rejects_server_errors() {
        let app = Router::new().route(
            "/{*path}",
            delete(|request: Request| async move {
                if request.uri().path().ends_with("missing.png") {
                    StatusCode::NOT_FOUND
                } else {
                    StatusCode::INTERNAL_SERVER_ERROR
                }
            }),
        );
        let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
        let address = listener.local_addr().unwrap();
        tokio::spawn(async move { axum::serve(listener, app).await.unwrap() });
        let storage = S3ObjectStorage::new(S3Config {
            endpoint: format!("http://{address}"),
            public_endpoint: "http://browser.invalid".to_string(),
            region: "us-east-1".to_string(),
            bucket: "media".to_string(),
            access_key: "access".to_string(),
            secret_key: "secret".to_string(),
            public_base_url: "http://browser.invalid/media".to_string(),
            force_path_style: true,
        });

        storage.delete_object("missing.png").await.unwrap();
        assert_eq!(
            storage.delete_object("failure.png").await,
            Err(StorageError::Unexpected)
        );
    }

    #[test]
    fn backend_download_uses_internal_endpoint_while_presign_uses_public_endpoint() {
        let storage = S3ObjectStorage::new(S3Config {
            endpoint: "http://minio:9000".to_string(),
            public_endpoint: "https://objects.example.com".to_string(),
            region: "us-east-1".to_string(),
            bucket: "media".to_string(),
            access_key: "access".to_string(),
            secret_key: "secret".to_string(),
            public_base_url: "https://objects.example.com/media".to_string(),
            force_path_style: true,
        });

        let public = storage.presigned_get_url("images/image one.png", true);
        let internal = storage.presigned_get_url("images/image one.png", false);
        assert!(public.starts_with("https://objects.example.com/media/"));
        assert!(internal.starts_with("http://minio:9000/media/"));
        assert!(public.contains("image%20one.png"));
    }

    #[tokio::test]
    async fn object_download_stops_when_a_chunked_response_exceeds_the_limit() {
        let app = Router::new().route(
            "/{*path}",
            get(|| async {
                Body::from_stream(futures_util::stream::iter([
                    Ok::<_, std::io::Error>(Bytes::from_static(b"abc")),
                    Ok(Bytes::from_static(b"def")),
                ]))
            }),
        );
        let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
        let address = listener.local_addr().unwrap();
        tokio::spawn(async move { axum::serve(listener, app).await.unwrap() });
        let storage = S3ObjectStorage::new(S3Config {
            endpoint: format!("http://{address}"),
            public_endpoint: "http://browser.invalid".to_string(),
            region: "us-east-1".to_string(),
            bucket: "media".to_string(),
            access_key: "access".to_string(),
            secret_key: "secret".to_string(),
            public_base_url: "http://browser.invalid/media".to_string(),
            force_path_style: true,
        });

        assert!(matches!(
            storage.get_object("oversized.png", 4).await,
            Err(StorageError::Unexpected)
        ));
    }
}
