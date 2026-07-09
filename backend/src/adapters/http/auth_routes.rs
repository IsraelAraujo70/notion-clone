use axum::Json;
use axum::extract::State;
use axum::http::StatusCode;
use axum::response::IntoResponse;
use serde::Deserialize;

use crate::adapters::http::auth_extractor::AuthenticatedUser;
use crate::adapters::http::dto::{
    AuthResponse, ChangePasswordRequest, LoginRequest, RequestPasswordResetRequest,
    ResetPasswordRequest, SignupRequest,
};
use crate::adapters::http::error::HttpError;
use crate::application::auth::attach_avatar_url;
use crate::application::auth::change_password::ChangePasswordInput;
use crate::application::auth::login::LoginInput;
use crate::application::auth::request_password_reset::RequestPasswordResetInput;
use crate::application::auth::reset_password::ResetPasswordInput;
use crate::application::auth::signup::SignupInput;
use crate::application::auth::update_profile::{
    PresignAvatarInput, PresignAvatarResponse, UpdateProfileInput,
};
use crate::bootstrap::state::AppState;
use crate::domain::auth::User;

#[derive(Debug, Deserialize)]
pub struct UpdateProfileRequest {
    pub display_name: Option<String>,
    pub avatar_key: Option<Option<String>>,
}

#[derive(Debug, Deserialize)]
pub struct PresignAvatarRequest {
    pub content_type: String,
}

pub async fn signup(
    State(state): State<AppState>,
    Json(request): Json<SignupRequest>,
) -> Result<impl IntoResponse, HttpError> {
    let response = state
        .signup
        .execute(SignupInput {
            email: request.email,
            password: request.password,
            display_name: request.display_name,
        })
        .await?;
    Ok((StatusCode::CREATED, Json(AuthResponse::from(response))))
}

pub async fn login(
    State(state): State<AppState>,
    Json(request): Json<LoginRequest>,
) -> Result<impl IntoResponse, HttpError> {
    let response = state
        .login
        .execute(LoginInput {
            email: request.email,
            password: request.password,
        })
        .await?;
    Ok((StatusCode::OK, Json(AuthResponse::from(response))))
}

pub async fn request_password_reset(
    State(state): State<AppState>,
    Json(request): Json<RequestPasswordResetRequest>,
) -> Result<StatusCode, HttpError> {
    state
        .request_password_reset
        .execute(RequestPasswordResetInput {
            email: request.email,
        })
        .await?;
    Ok(StatusCode::NO_CONTENT)
}

pub async fn reset_password(
    State(state): State<AppState>,
    Json(request): Json<ResetPasswordRequest>,
) -> Result<StatusCode, HttpError> {
    state
        .reset_password
        .execute(ResetPasswordInput {
            token: request.token,
            password: request.password,
        })
        .await?;
    Ok(StatusCode::NO_CONTENT)
}

pub async fn change_password(
    State(state): State<AppState>,
    auth: AuthenticatedUser,
    Json(request): Json<ChangePasswordRequest>,
) -> Result<StatusCode, HttpError> {
    state
        .change_password
        .execute(ChangePasswordInput {
            user_id: auth.user.id,
            email: auth.user.email,
            current_token_hash: auth.token_hash,
            current_password: request.current_password,
            new_password: request.new_password,
        })
        .await?;
    Ok(StatusCode::NO_CONTENT)
}

pub async fn logout(
    State(state): State<AppState>,
    auth: AuthenticatedUser,
) -> Result<StatusCode, HttpError> {
    state.logout.execute_hash(&auth.token_hash).await?;
    Ok(StatusCode::NO_CONTENT)
}

pub async fn me(State(state): State<AppState>, auth: AuthenticatedUser) -> Json<User> {
    Json(attach_avatar_url(auth.user, &state.storage))
}

pub async fn update_profile(
    State(state): State<AppState>,
    auth: AuthenticatedUser,
    Json(request): Json<UpdateProfileRequest>,
) -> Result<Json<User>, HttpError> {
    let user = state
        .update_profile
        .execute(UpdateProfileInput {
            user_id: auth.user.id,
            display_name: request.display_name,
            avatar_key: request.avatar_key,
        })
        .await?;
    Ok(Json(user))
}

pub async fn presign_avatar(
    State(state): State<AppState>,
    auth: AuthenticatedUser,
    Json(request): Json<PresignAvatarRequest>,
) -> Result<Json<PresignAvatarResponse>, HttpError> {
    let response = state
        .presign_avatar
        .execute(PresignAvatarInput {
            user_id: auth.user.id,
            content_type: request.content_type,
        })
        .await?;
    Ok(Json(response))
}
