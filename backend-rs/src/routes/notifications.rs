use axum::{
    extract::{Path, State},
    routing::{delete, get, patch, post},
    Json, Router,
};
use serde::Serialize;
use time::format_description::well_known::Rfc3339;

use crate::auth::AuthUser;
use crate::db::models::NotificationRecord;
use crate::error::AppError;
use crate::state::AppState;

#[derive(Serialize)]
pub struct NotificationResponse {
    pub id: String,
    #[serde(rename = "userId")]
    pub user_id: String,
    pub r#type: String,
    pub title: String,
    pub body: String,
    pub data: serde_json::Value,
    pub read: bool,
    #[serde(rename = "isRead")]
    pub is_read: bool,
    #[serde(rename = "createdAt")]
    pub created_at: String,
}

impl From<NotificationRecord> for NotificationResponse {
    fn from(n: NotificationRecord) -> Self {
        Self {
            id: n.id,
            user_id: n.user_id,
            r#type: n.r#type,
            title: n.title,
            body: n.body,
            data: n.data,
            read: n.read,
            is_read: n.read,
            created_at: n.created_at.format(&Rfc3339).unwrap_or_default(),
        }
    }
}

#[derive(Serialize)]
pub struct NotificationsListResponse {
    pub notifications: Vec<NotificationResponse>,
    #[serde(rename = "unreadCount")]
    pub unread_count: i64,
}

#[derive(Serialize)]
pub struct GenericMessageResponse {
    pub message: String,
}

// GET /api/notifications
async fn list_notifications(
    State(state): State<AppState>,
    AuthUser(user): AuthUser,
) -> Result<Json<NotificationsListResponse>, AppError> {
    let records = sqlx::query_as::<_, NotificationRecord>(
        "SELECT id, user_id, type, title, body, data, read, created_at FROM notifications WHERE user_id = $1 ORDER BY created_at DESC LIMIT 50",
    )
    .bind(&user.id)
    .fetch_all(&state.pool)
    .await
    .map_err(AppError::Database)?;

    let unread_count: (i64,) = sqlx::query_as(
        "SELECT COUNT(*)::bigint FROM notifications WHERE user_id = $1 AND read = false",
    )
    .bind(&user.id)
    .fetch_one(&state.pool)
    .await
    .map_err(AppError::Database)?;

    let notifications = records.into_iter().map(NotificationResponse::from).collect();

    Ok(Json(NotificationsListResponse {
        notifications,
        unread_count: unread_count.0,
    }))
}

// PATCH /api/notifications/:id/read
async fn mark_notification_read(
    State(state): State<AppState>,
    AuthUser(user): AuthUser,
    Path(id): Path<String>,
) -> Result<Json<GenericMessageResponse>, AppError> {
    sqlx::query("UPDATE notifications SET read = true WHERE id = $1 AND user_id = $2")
        .bind(id)
        .bind(&user.id)
        .execute(&state.pool)
        .await
        .map_err(AppError::Database)?;

    Ok(Json(GenericMessageResponse {
        message: "Notification marked as read".to_string(),
    }))
}

// POST /api/notifications/read-all
async fn mark_all_read(
    State(state): State<AppState>,
    AuthUser(user): AuthUser,
) -> Result<Json<GenericMessageResponse>, AppError> {
    sqlx::query("UPDATE notifications SET read = true WHERE user_id = $1 AND read = false")
        .bind(&user.id)
        .execute(&state.pool)
        .await
        .map_err(AppError::Database)?;

    Ok(Json(GenericMessageResponse {
        message: "All notifications marked as read".to_string(),
    }))
}

// DELETE /api/notifications/clear-all
async fn clear_all(
    State(state): State<AppState>,
    AuthUser(user): AuthUser,
) -> Result<Json<GenericMessageResponse>, AppError> {
    sqlx::query("DELETE FROM notifications WHERE user_id = $1")
        .bind(&user.id)
        .execute(&state.pool)
        .await
        .map_err(AppError::Database)?;

    Ok(Json(GenericMessageResponse {
        message: "All notifications deleted".to_string(),
    }))
}

// DELETE /api/notifications/:id
async fn delete_one(
    State(state): State<AppState>,
    AuthUser(user): AuthUser,
    Path(id): Path<String>,
) -> Result<Json<GenericMessageResponse>, AppError> {
    sqlx::query("DELETE FROM notifications WHERE id = $1 AND user_id = $2")
        .bind(id)
        .bind(&user.id)
        .execute(&state.pool)
        .await
        .map_err(AppError::Database)?;

    Ok(Json(GenericMessageResponse {
        message: "Notification deleted".to_string(),
    }))
}

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/api/notifications", get(list_notifications))
        .route("/api/notifications/:id/read", patch(mark_notification_read))
        .route("/api/notifications/read-all", post(mark_all_read))
        .route("/api/notifications/clear-all", delete(clear_all).post(clear_all))
        .route("/api/notifications/:id", delete(delete_one))
}
