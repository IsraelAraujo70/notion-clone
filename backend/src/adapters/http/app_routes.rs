use axum::Json;

use crate::adapters::http::auth_extractor::AuthenticatedUser;
use crate::adapters::http::dto::AppSummaryResponse;

pub async fn summary(_auth: AuthenticatedUser) -> Json<AppSummaryResponse> {
    Json(AppSummaryResponse::starter())
}
