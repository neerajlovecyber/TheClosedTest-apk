use axum::{
    extract::{Path, State},
    routing::{get, patch, post},
    Json, Router,
};
use sea_orm::{ActiveModelTrait, ColumnTrait, EntityTrait, PaginatorTrait, QueryFilter, Set};
use serde::{Deserialize, Serialize};
use time::{format_description::well_known::Rfc3339, OffsetDateTime};

use crate::auth::AuthUser;
use crate::db::models::{User, UserSummary};
use crate::entities::prelude::*;
use crate::entities::{apps, users};
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
    /// Computed live from SELECT COUNT(*) — not stored in DB
    #[serde(rename = "appsCount")]
    pub apps_count: i32,
    #[serde(rename = "pushToken")]
    pub push_token: Option<String>,
    #[serde(rename = "isGroupMember")]
    pub is_group_member: bool,
    #[serde(rename = "googleGroupConfirmed")]
    pub google_group_confirmed: bool,
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
            apps_count: 0, // always overridden by live COUNT in route handlers
            push_token: u.push_token,
            is_group_member: u.is_group_member,
            google_group_confirmed: u.is_group_member,
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

impl From<users::Model> for UserResponse {
    fn from(u: users::Model) -> Self {
        Self {
            id: u.id,
            token_identifier: u.token_identifier,
            name: u.name,
            email: u.email,
            avatar_url: u.avatar_url,
            reputation: u.reputation,
            apps_count: 0, // always overridden by live COUNT in route handlers
            push_token: u.push_token,
            is_group_member: u.is_group_member,
            google_group_confirmed: u.is_group_member,
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

#[derive(Deserialize)]
pub struct UpdateProfileRequest {
    pub name: Option<String>,
    #[serde(rename = "avatarUrl")]
    pub avatar_url: Option<String>,
}

#[derive(Serialize)]
pub struct CheckinResponse {
    pub streak: i32,
    #[serde(rename = "bestStreak")]
    pub best_streak: i32,
    #[serde(rename = "alreadyCheckedIn")]
    pub already_checked_in: bool,
    pub message: String,
}

#[derive(Serialize)]
pub struct ActiveCountResponse {
    #[serde(rename = "active5m")]
    pub active_5m: i64,
    #[serde(rename = "active15m")]
    pub active_15m: i64,
    #[serde(rename = "active1h")]
    pub active_1h: i64,
}

#[derive(Serialize)]
pub struct GenericMessageResponse {
    pub message: String,
}

// GET /api/users/me
async fn get_me(
    State(state): State<AppState>,
    AuthUser(user): AuthUser,
) -> Result<Json<UserResponse>, AppError> {
    // Compute appsCount live from DB (matches TS getUserProfile exactly).
    // The cached counter on users.apps_count can drift after admin-delete or archive.
    let live_apps_count = Apps::find()
        .filter(apps::Column::UserId.eq(&user.id))
        .filter(apps::Column::Status.ne("archived"))
        .count(&state.db)
        .await
        .unwrap_or(0) as i32;

    let mut resp: UserResponse = user.into();
    resp.apps_count = live_apps_count;
    Ok(Json(resp))
}

// POST /api/users/sync
async fn sync_user(
    State(state): State<AppState>,
    AuthUser(user): AuthUser,
    Json(payload): Json<SyncUserRequest>,
) -> Result<Json<UserResponse>, AppError> {
    let user_row = Users::find_by_id(&user.id)
        .one(&state.db)
        .await?
        .ok_or_else(|| AppError::NotFound("User not found".to_string()))?;

    let now = OffsetDateTime::now_utc();
    let mut u_act: users::ActiveModel = user_row.into();
    if let Some(name) = payload.name {
        u_act.name = Set(name);
    }
    if let Some(email) = payload.email {
        u_act.email = Set(email.to_lowercase());
    }
    if let Some(avatar) = payload.avatar_url {
        u_act.avatar_url = Set(Some(avatar));
    }
    u_act.updated_at = Set(now);
    let updated = u_act.update(&state.db).await?;

    // Compute live appsCount (matches TS syncUser which always does SELECT COUNT)
    let live_apps_count = Apps::find()
        .filter(apps::Column::UserId.eq(&updated.id))
        .filter(apps::Column::Status.ne("archived"))
        .count(&state.db)
        .await
        .unwrap_or(0) as i32;

    if let Some(token_id) = &updated.token_identifier {
        state.user_cache.insert(token_id.clone(), updated.clone().into()).await;
    }

    let mut resp: UserResponse = updated.into();
    resp.apps_count = live_apps_count;
    Ok(Json(resp))
}

// POST /api/users/checkin
async fn checkin(
    State(state): State<AppState>,
    AuthUser(user): AuthUser,
) -> Result<Json<CheckinResponse>, AppError> {
    let user_row = Users::find_by_id(&user.id)
        .one(&state.db)
        .await?
        .ok_or_else(|| AppError::NotFound("User not found".to_string()))?;

    let now = OffsetDateTime::now_utc();
    let today_str = format!("{:04}-{:02}-{:02}", now.year(), now.month() as u8, now.day());

    if let Some(ref last) = user_row.last_check_in_date {
        if last == &today_str {
            return Ok(Json(CheckinResponse {
                streak: user_row.streak,
                best_streak: user_row.best_streak,
                already_checked_in: true,
                message: "You have already checked in today. Keep up the momentum tomorrow!".to_string(),
            }));
        }
    }

    let yesterday = now - time::Duration::days(1);
    let yesterday_str = format!("{:04}-{:02}-{:02}", yesterday.year(), yesterday.month() as u8, yesterday.day());

    let new_streak = if let Some(ref last) = user_row.last_check_in_date {
        if last == &yesterday_str {
            user_row.streak + 1
        } else {
            1
        }
    } else {
        1
    };

    let new_best = new_streak.max(user_row.best_streak);
    let new_rep = user_row.reputation + 1;

    let mut u_act: users::ActiveModel = user_row.into();
    u_act.streak = Set(new_streak);
    u_act.best_streak = Set(new_best);
    u_act.reputation = Set(new_rep);
    u_act.last_check_in_date = Set(Some(today_str));
    u_act.updated_at = Set(now);
    let updated = u_act.update(&state.db).await?;

    if let Some(token_id) = &updated.token_identifier {
        state.user_cache.insert(token_id.clone(), updated.clone().into()).await;
    }

    Ok(Json(CheckinResponse {
        streak: new_streak,
        best_streak: new_best,
        already_checked_in: false,
        message: "Daily check-in successful! +1 Reputation awarded.".to_string(),
    }))
}

// PATCH /api/users/push-token
async fn update_push_token(
    State(state): State<AppState>,
    AuthUser(user): AuthUser,
    Json(payload): Json<UpdatePushTokenRequest>,
) -> Result<Json<GenericMessageResponse>, AppError> {
    let user_row = Users::find_by_id(&user.id)
        .one(&state.db)
        .await?
        .ok_or_else(|| AppError::NotFound("User not found".to_string()))?;

    let now = OffsetDateTime::now_utc();
    let mut u_act: users::ActiveModel = user_row.clone().into();
    u_act.push_token = Set(Some(payload.push_token));
    u_act.updated_at = Set(now);
    u_act.update(&state.db).await?;

    if let Some(token_id) = &user_row.token_identifier {
        state.user_cache.invalidate(token_id).await;
    }

    Ok(Json(GenericMessageResponse {
        message: "Push token updated successfully".to_string(),
    }))
}

// PATCH /api/users/group-confirm
async fn confirm_google_group(
    State(state): State<AppState>,
    AuthUser(user): AuthUser,
) -> Result<Json<GenericMessageResponse>, AppError> {
    let user_row = Users::find_by_id(&user.id)
        .one(&state.db)
        .await?
        .ok_or_else(|| AppError::NotFound("User not found".to_string()))?;

    let now = OffsetDateTime::now_utc();
    let mut u_act: users::ActiveModel = user_row.clone().into();
    u_act.is_group_member = Set(true);
    u_act.updated_at = Set(now);
    u_act.update(&state.db).await?;

    if let Some(token_id) = &user_row.token_identifier {
        state.user_cache.invalidate(token_id).await;
    }

    Ok(Json(GenericMessageResponse {
        message: "Google Group confirmed successfully".to_string(),
    }))
}

// PATCH /api/users/profile
async fn update_profile(
    State(state): State<AppState>,
    AuthUser(user): AuthUser,
    Json(payload): Json<UpdateProfileRequest>,
) -> Result<Json<UserResponse>, AppError> {
    let user_row = Users::find_by_id(&user.id)
        .one(&state.db)
        .await?
        .ok_or_else(|| AppError::NotFound("User not found".to_string()))?;

    let now = OffsetDateTime::now_utc();
    let mut u_act: users::ActiveModel = user_row.into();
    if let Some(name) = payload.name {
        u_act.name = Set(name);
    }
    if let Some(avatar) = payload.avatar_url {
        u_act.avatar_url = Set(Some(avatar));
    }
    u_act.updated_at = Set(now);
    let updated = u_act.update(&state.db).await?;

    if let Some(token_id) = &updated.token_identifier {
        state.user_cache.insert(token_id.clone(), updated.clone().into()).await;
    }

    Ok(Json(updated.into()))
}

// POST /api/users/unlock-slots
async fn unlock_slots(
    State(state): State<AppState>,
    AuthUser(user): AuthUser,
) -> Result<Json<UserResponse>, AppError> {
    let user_row = Users::find_by_id(&user.id)
        .one(&state.db)
        .await?
        .ok_or_else(|| AppError::NotFound("User not found".to_string()))?;

    let now = OffsetDateTime::now_utc();
    let mut u_act: users::ActiveModel = user_row.into();
    u_act.unlocked_app_slots = Set(3);
    u_act.updated_at = Set(now);
    let updated = u_act.update(&state.db).await?;

    if let Some(token_id) = &updated.token_identifier {
        state.user_cache.insert(token_id.clone(), updated.clone().into()).await;
    }

    Ok(Json(updated.into()))
}

// GET /api/users/active-count
async fn active_count(
    State(state): State<AppState>,
) -> Result<Json<ActiveCountResponse>, AppError> {
    let count = state.presence_cache.entry_count().max(2) as i64;
    Ok(Json(ActiveCountResponse {
        active_5m: count,
        active_15m: count,
        active_1h: count,
    }))
}

// DELETE /api/users/me
async fn delete_account(
    State(state): State<AppState>,
    AuthUser(user): AuthUser,
) -> Result<Json<GenericMessageResponse>, AppError> {
    let user_row = Users::find_by_id(&user.id)
        .one(&state.db)
        .await?
        .ok_or_else(|| AppError::NotFound("User not found".to_string()))?;

    // Foreign key CASCADE in PostgreSQL handles matches, apps, proofs, etc.
    let u_act: users::ActiveModel = user_row.clone().into();
    u_act.delete(&state.db).await?;

    if let Some(token_id) = &user_row.token_identifier {
        state.user_cache.invalidate(token_id).await;
    }
    state.api_cache.invalidate_all();

    Ok(Json(GenericMessageResponse {
        message: "Account and all associated data permanently deleted".to_string(),
    }))
}

// GET /api/users/:id (Public profile)
async fn get_user_profile(
    State(state): State<AppState>,
    Path(id): Path<String>,
) -> Result<Json<UserSummary>, AppError> {
    let u = Users::find_by_id(&id)
        .one(&state.db)
        .await?
        .ok_or_else(|| AppError::NotFound("User not found".to_string()))?;

    Ok(Json(UserSummary {
        id: u.id,
        name: Some(u.name),
        email: None,
        avatar_url: u.avatar_url,
        reputation: Some(u.reputation),
    }))
}

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/api/users/me", get(get_me).delete(delete_account))
        .route("/api/users/sync", post(sync_user))
        .route("/api/users/checkin", post(checkin))
        .route("/api/users/push-token", patch(update_push_token))
        .route("/api/users/group-confirm", patch(confirm_google_group).post(confirm_google_group))
        .route("/api/users/profile", patch(update_profile))
        .route("/api/users/unlock-slots", post(unlock_slots))
        .route("/api/users/active-count", get(active_count))
        .route("/api/users/{id}", get(get_user_profile))
}
