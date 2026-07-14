use std::env;

use tower_http::cors::{AllowOrigin, Any, CorsLayer};

use crate::adapters::storage::S3Config;

pub const DEFAULT_PUBLIC_WEB_URL: &str = "http://localhost:3000";
pub const DEFAULT_RESEND_FROM_EMAIL: &str = "MicroSaaS Starter <onboarding@resend.dev>";
pub const DEFAULT_AI_CHAT_MODEL: &str = "openai/gpt-5.6-luna";
pub const DEFAULT_AI_TITLE_MODEL: &str = "deepseek/deepseek-v4-flash";
pub const DEFAULT_AI_EMBEDDING_MODEL: &str = "openai/text-embedding-3-large";

#[derive(Debug, Clone)]
pub struct Config {
    pub host: String,
    pub port: String,
    pub database_url: String,
    pub public_web_url: String,
    pub resend_api_key: Option<String>,
    pub resend_from_email: String,
    pub s3: Option<S3Config>,
}

impl Config {
    pub fn from_env() -> Self {
        Self {
            host: env::var("HOST").unwrap_or_else(|_| "0.0.0.0".to_string()),
            port: env::var("PORT").unwrap_or_else(|_| "8080".to_string()),
            database_url: env::var("DATABASE_URL").expect("DATABASE_URL must be set"),
            public_web_url: env::var("PUBLIC_WEB_URL")
                .unwrap_or_else(|_| DEFAULT_PUBLIC_WEB_URL.to_string()),
            resend_api_key: env_string("RESEND_API_KEY"),
            resend_from_email: env::var("RESEND_FROM_EMAIL")
                .unwrap_or_else(|_| DEFAULT_RESEND_FROM_EMAIL.to_string()),
            s3: s3_from_env(),
        }
    }

    pub fn from_env_defaults() -> Self {
        Self {
            host: env::var("HOST").unwrap_or_else(|_| "0.0.0.0".to_string()),
            port: env::var("PORT").unwrap_or_else(|_| "8080".to_string()),
            database_url: env::var("DATABASE_URL").unwrap_or_default(),
            public_web_url: env::var("PUBLIC_WEB_URL")
                .unwrap_or_else(|_| DEFAULT_PUBLIC_WEB_URL.to_string()),
            resend_api_key: env_string("RESEND_API_KEY"),
            resend_from_email: env::var("RESEND_FROM_EMAIL")
                .unwrap_or_else(|_| DEFAULT_RESEND_FROM_EMAIL.to_string()),
            s3: s3_from_env(),
        }
    }

    pub fn address(&self) -> String {
        format!("{}:{}", self.host, self.port)
    }
}

fn s3_from_env() -> Option<S3Config> {
    // Aceita nomes do drive-clone (S3_ENDPOINT_URL / S3_ACCESS_KEY_ID) e os curtos.
    let endpoint = env_string("S3_ENDPOINT_URL")
        .or_else(|| env_string("S3_ENDPOINT"))
        .or_else(|| env_string("S3_PUBLIC_ENDPOINT_URL"))
        .or_else(|| env_string("S3_PUBLIC_ENDPOINT"))?;
    let public_endpoint = env_string("S3_PUBLIC_ENDPOINT_URL")
        .or_else(|| env_string("S3_PUBLIC_ENDPOINT"))
        .unwrap_or_else(|| endpoint.clone());
    let bucket = env_string("S3_BUCKET")?;
    let access_key = env_string("S3_ACCESS_KEY_ID").or_else(|| env_string("S3_ACCESS_KEY"))?;
    let secret_key = env_string("S3_SECRET_ACCESS_KEY").or_else(|| env_string("S3_SECRET_KEY"))?;
    let region = env::var("S3_REGION").unwrap_or_else(|_| "us-east-1".to_string());
    let public_base_url = env_string("S3_PUBLIC_BASE_URL")
        .unwrap_or_else(|| format!("{}/{}", public_endpoint.trim_end_matches('/'), bucket));
    let force_path_style = env::var("S3_URL_STYLE")
        .map(|v| v.eq_ignore_ascii_case("path"))
        .ok()
        .or_else(|| {
            env::var("S3_FORCE_PATH_STYLE")
                .ok()
                .map(|v| v == "1" || v.eq_ignore_ascii_case("true"))
        })
        .unwrap_or(true);
    Some(S3Config {
        endpoint,
        public_endpoint,
        region,
        bucket,
        access_key,
        secret_key,
        public_base_url,
        force_path_style,
    })
}

#[derive(Debug, Clone)]
pub struct CorsConfig {
    allowed_origins: Option<String>,
}

impl CorsConfig {
    pub fn from_env() -> Self {
        Self {
            allowed_origins: env::var("CORS_ALLOWED_ORIGINS").ok(),
        }
    }

    pub fn layer(&self) -> CorsLayer {
        let origin = match &self.allowed_origins {
            Some(list) => AllowOrigin::list(list.split(',').filter_map(|o| o.trim().parse().ok())),
            // ponytail: permissive default for local dev; production must set CORS_ALLOWED_ORIGINS
            None => AllowOrigin::any(),
        };
        CorsLayer::new()
            .allow_origin(origin)
            .allow_methods(Any)
            .allow_headers(Any)
    }
}

fn env_string(name: &str) -> Option<String> {
    env::var(name)
        .ok()
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty())
}
