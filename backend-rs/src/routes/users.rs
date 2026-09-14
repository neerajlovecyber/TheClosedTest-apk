use axum::{
    extract::{Path, State},
    routing::{get, patch, post},
    Json, Router,
};
use serde::{Deserialize, Serialize};
use time::{format_description::well_known::Rfc3339, OffsetDateTime};

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
            apps_count: u.apps_count,
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

// POST /api/users/checkin
async fn checkin(
    State(state): State<AppState>,
    AuthUser(user): AuthUser,
) -> Result<Json<CheckinResponse>, AppError> {
    let now = OffsetDateTime::now_utc();
    let today_str = format!("{:04}-{:02}-{:02}", now.year(), now.month() as u8, now.day());

    if let Some(ref last) = user.last_check_in_date {
        if last == &today_str {
            return Ok(Json(CheckinResponse {
                streak: user.streak,
                best_streak: user.best_streak,
                already_checked_in: true,
                message: "You have already checked in today. Keep up the momentum tomorrow!".to_string(),
            }));
        }
    }

    let yesterday = now - time::Duration::days(1);
    let yesterday_str = format!("{:04}-{:02}-{:02}", yesterday.year(), yesterday.month() as u8, yesterday.day());

    let new_streak = if let Some(ref last) = user.last_check_in_date {
        if last == &yesterday_str {
            user.streak + 1
        } else {
            1
        }
    } else {
        1
    };

    let new_best = new_streak.max(user.best_streak);
    let new_rep = user.reputation + 1;

    let updated = sqlx::query_as::<_, User>(
        r#"UPDATE users
           SET streak = $1, best_streak = $2, reputation = $3, last_check_in_date = $4, updated_at = NOW()
           WHERE id = $5
           RETURNING id, token_identifier, name, email, avatar_url, reputation, apps_count,
                     push_token, is_group_member, is_admin, streak, best_streak,
                     last_check_in_date, unlocked_app_slots, created_at, updated_at"#,
    )
    .bind(new_streak)
    .bind(new_best)
    .bind(new_rep)
    .bind(&today_str)
    .bind(&user.id)
    .fetch_one(&state.pool)
    .await
    .map_err(AppError::Database)?;

    if let Some(token_id) = &updated.token_identifier {
        state.user_cache.insert(token_id.clone(), updated).await;
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
    sqlx::query("UPDATE users SET push_token = $1, updated_at = NOW() WHERE id = $2")
        .bind(payload.push_token)
        .bind(&user.id)
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

// PATCH /api/users/group-confirm
async fn confirm_google_group(
    State(state): State<AppState>,
    AuthUser(user): AuthUser,
) -> Result<Json<GenericMessageResponse>, AppError> {
    sqlx::query("UPDATE users SET is_group_member = true, updated_at = NOW() WHERE id = $1")
        .bind(&user.id)
        .execute(&state.pool)
        .await
        .map_err(AppError::Database)?;

    if let Some(token_id) = &user.token_identifier {
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
    let name = payload.name.unwrap_or(user.name);
    let avatar_url = payload.avatar_url.or(user.avatar_url);

    let updated = sqlx::query_as::<_, User>(
        r#"UPDATE users
           SET name = $1, avatar_url = $2, updated_at = NOW()
           WHERE id = $3
           RETURNING id, token_identifier, name, email, avatar_url, reputation, apps_count,
                     push_token, is_group_member, is_admin, streak, best_streak,
                     last_check_in_date, unlocked_app_slots, created_at, updated_at"#,
    )
    .bind(name)
    .bind(avatar_url)
    .bind(&user.id)
    .fetch_one(&state.pool)
    .await
    .map_err(AppError::Database)?;

    if let Some(token_id) = &updated.token_identifier {
        state.user_cache.insert(token_id.clone(), updated.clone()).await;
    }

    Ok(Json(updated.into()))
}

// POST /api/users/unlock-slots
async fn unlock_slots(
    State(state): State<AppState>,
    AuthUser(user): AuthUser,
) -> Result<Json<UserResponse>, AppError> {
    let updated = sqlx::query_as::<_, User>(
        r#"UPDATE users
           SET unlocked_app_slots = 3, updated_at = NOW()
           WHERE id = $1
           RETURNING id, token_identifier, name, email, avatar_url, reputation, apps_count,
                     push_token, is_group_member, is_admin, streak, best_streak,
                     last_check_in_date, unlocked_app_slots, created_at, updated_at"#,
    )
    .bind(&user.id)
    .fetch_one(&state.pool)
    .await
    .map_err(AppError::Database)?;

    if let Some(token_id) = &updated.token_identifier {
        state.user_cache.insert(token_id.clone(), updated.clone()).await;
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
    // Cascade delete user data
    let _ = sqlx::query("DELETE FROM proofs WHERE uploader_id = $1").bind(&user.id).execute(&state.pool).await;
    let _ = sqlx::query("DELETE FROM messages WHERE sender_id = $1").bind(&user.id).execute(&state.pool).await;
    let _ = sqlx::query("DELETE FROM reports WHERE reporter_id = $1 OR target_id = $1").bind(&user.id).execute(&state.pool).await;
    let _ = sqlx::query("DELETE FROM matches WHERE user1_id = $1 OR user2_id = $1").bind(&user.id).execute(&state.pool).await;
    let _ = sqlx::query("DELETE FROM apps WHERE user_id = $1").bind(&user.id).execute(&state.pool).await;
    let _ = sqlx::query("DELETE FROM notifications WHERE user_id = $1").bind(&user.id).execute(&state.pool).await;
    let _ = sqlx::query("DELETE FROM user_bans WHERE user_id = $1").bind(&user.id).execute(&state.pool).await;
    let _ = sqlx::query("DELETE FROM users WHERE id = $1").bind(&user.id).execute(&state.pool).await;

    if let Some(token_id) = &user.token_identifier {
        state.user_cache.invalidate(token_id).await;
    }

    Ok(Json(GenericMessageResponse {
        message: "Account and all associated data permanently deleted".to_string(),
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
        .route("/api/users/me", get(get_me).delete(delete_account))
        .route("/api/users/sync", post(sync_user))
        .route("/api/users/checkin", post(checkin))
        .route("/api/users/push-token", patch(update_push_token))
        .route("/api/users/group-confirm", patch(confirm_google_group))
        .route("/api/users/profile", patch(update_profile))
        .route("/api/users/unlock-slots", post(unlock_slots))
        .route("/api/users/active-count", get(active_count))
        .route("/api/users/{id}", get(get_user_profile))
}
