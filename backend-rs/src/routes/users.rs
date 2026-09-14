use axum::{
    extract::{Path, State},
    routing::{get, patch, post},
    Json, Router,
};
use serde::{Deserialize, Serialize};
use time::format_description::well_known::Rfc3339;

use crate::auth::AuthUser;
use crate::db::models::{User, UserSummary};
use crate::error::AppError;
use crate::state::AppState;

#[derive(Serialize)]
pub struct UserResponse {
    pub id: String,
    #[serde(rename = "tokenIdentifier")]
    pub token_identifier: Option<String>,
    pub name: String,
    pub email: String,
    #[serde(rename = "avatarUrl")]
    pub avatar_url: Option<String>,
    pub reputation: i32,
    #[serde(rename = "appsCount")]
    pub apps_count: i32,
    #[serde(rename = "pushToken")]
    pub push_token: Option<String>,
    #[serde(rename = "isGroupMember")]
    pub is_group_member: bool,
    #[serde(rename = "isAdmin")]
    pub is_admin: bool,
    pub streak: i32,
    #[serde(rename = "bestStreak")]
    pub best_streak: i32,
    #[serde(rename = "lastCheckInDate")]
    pub last_check_in_date: Option<String>,
    #[serde(rename = "unlockedAppSlots")]
    pub unlocked_app_slots: i32,
    #[serde(rename = "createdAt")]
    pub created_at: String,
    #[serde(rename = "updatedAt")]
    pub updated_at: String,
}

impl From<User> for UserResponse {
    fn from(u: User) -> Self {
        Self {
            id: u.id,
            token_identifier: u.token_identifier,
            name: u.name,
            email: u.email,
            avatar_url: u.avatar_url,
            reputation: u.reputation,
            apps_count: u.apps_count,
            push_token: u.push_token,
            is_group_member: u.is_group_member,
            is_admin: u.is_admin,
            streak: u.streak,
            best_streak: u.best_streak,
            last_check_in_date: u.last_check_in_date,
            unlocked_app_slots: u.unlocked_app_slots,
            created_at: u.created_at.format(&Rfc3339).unwrap_or_default(),
            updated_at: u.updated_at.format(&Rfc3339).unwrap_or_default(),
        }
    }
}

#[derive(Deserialize)]
pub struct UpdatePushTokenRequest {
    #[serde(rename = "pushToken")]
    pub push_token: String,
}

#[derive(Deserialize)]
pub struct SyncUserRequest {
    pub name: Option<String>,
    pub email: Option<String>,
    #[serde(rename = "avatarUrl")]
    pub avatar_url: Option<String>,
}

#[derive(Serialize)]
pub struct GenericMessageResponse {
    pub message: String,
}

// GET /api/users/me
async fn get_me(
    State(_state): State<AppState>,
    AuthUser(user): AuthUser,
) -> Result<Json<UserResponse>, AppError> {
    Ok(Json(user.into()))
}

// POST /api/users/sync
async fn sync_user(
    State(state): State<AppState>,
    AuthUser(user): AuthUser,
    Json(payload): Json<SyncUserRequest>,
) -> Result<Json<UserResponse>, AppError> {
    let name = payload.name.unwrap_or(user.name);
    let email = payload.email.unwrap_or(user.email);
    let avatar_url = payload.avatar_url.or(user.avatar_url);

    let updated = sqlx::query_as::<_, User>(
        r#"UPDATE users
           SET name = $1, email = $2, avatar_url = $3, updated_at = NOW()
           WHERE id = $4
           RETURNING id, token_identifier, name, email, avatar_url, reputation, apps_count,
                     push_token, is_group_member, is_admin, streak, best_streak,
                     last_check_in_date, unlocked_app_slots, created_at, updated_at"#,
    )
    .bind(name)
    .bind(email)
    .bind(avatar_url)
    .bind(user.id)
    .fetch_one(&state.pool)
    .await
    .map_err(AppError::Database)?;

    if let Some(token_id) = &updated.token_identifier {
        state.user_cache.insert(token_id.clone(), updated.clone()).await;
    }

    Ok(Json(updated.into()))
}

// PATCH /api/users/push-token
async fn update_push_token(
    State(state): State<AppState>,
    AuthUser(user): AuthUser,
    Json(payload): Json<UpdatePushTokenRequest>,
) -> Result<Json<GenericMessageResponse>, AppError> {
    sqlx::query("UPDATE users SET push_token = $1, updated_at = NOW() WHERE id = $2")
        .bind(payload.push_token)
        .bind(user.id)
        .execute(&state.pool)
        .await
        .map_err(AppError::Database)?;

    if let Some(token_id) = &user.token_identifier {
        state.user_cache.invalidate(token_id).await;
    }

    Ok(Json(GenericMessageResponse {
        message: "Push token updated successfully".to_string(),
    }))
}

// GET /api/users/:id (Public profile)
async fn get_user_profile(
    State(state): State<AppState>,
    Path(id): Path<String>,
) -> Result<Json<UserSummary>, AppError> {
    let user = sqlx::query_as::<_, User>(
        r#"SELECT id, token_identifier, name, email, avatar_url, reputation, apps_count,
                  push_token, is_group_member, is_admin, streak, best_streak,
                  last_check_in_date, unlocked_app_slots, created_at, updated_at
           FROM users WHERE id = $1"#,
    )
    .bind(id)
    .fetch_optional(&state.pool)
    .await
    .map_err(AppError::Database)?
    .ok_or_else(|| AppError::NotFound("User not found".to_string()))?;

    Ok(Json(UserSummary {
        id: user.id,
        name: Some(user.name),
        email: None,
        avatar_url: user.avatar_url,
        reputation: Some(user.reputation),
    }))
}

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/api/users/me", get(get_me))
        .route("/api/users/sync", post(sync_user))
        .route("/api/users/push-token", patch(update_push_token))
        .route("/api/users/:id", get(get_user_profile))
}
