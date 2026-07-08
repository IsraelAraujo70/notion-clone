use std::env;

use tower_http::cors::{AllowOrigin, Any, CorsLayer};

pub const DEFAULT_PUBLIC_WEB_URL: &str = "http://localhost:3000";
pub const DEFAULT_RESEND_FROM_EMAIL: &str = "MicroSaaS Starter <onboarding@resend.dev>";

#[derive(Debug, Clone)]
pub struct Config {
    pub host: String,
    pub port: String,
    pub database_url: String,
    pub public_web_url: String,
    pub resend_api_key: Option<String>,
    pub resend_from_email: String,
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
        }
    }

    pub fn address(&self) -> String {
        format!("{}:{}", self.host, self.port)
    }
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
