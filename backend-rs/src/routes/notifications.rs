use axum::{
    extract::{Path, State},
    routing::{delete, get, patch, post},
    Json, Router,
};
use sea_orm::{
    ActiveModelTrait, ColumnTrait, EntityTrait, PaginatorTrait, QueryFilter, QueryOrder, QuerySelect, Set,
    sea_query::Expr,
};
use serde::Serialize;
use time::format_description::well_known::Rfc3339;

use crate::auth::AuthUser;
use crate::db::models::NotificationRecord;
use crate::entities::notifications;
use crate::entities::prelude::*;
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

impl From<notifications::Model> for NotificationResponse {
    fn from(n: notifications::Model) -> Self {
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
    let records = Notifications::find()
        .filter(notifications::Column::UserId.eq(&user.id))
        .order_by_desc(notifications::Column::CreatedAt)
        .limit(50)
        .all(&state.db)
        .await?;

    let unread_count = Notifications::find()
        .filter(notifications::Column::UserId.eq(&user.id))
        .filter(notifications::Column::Read.eq(false))
        .count(&state.db)
        .await? as i64;

    let notifications = records.into_iter().map(NotificationResponse::from).collect();

    Ok(Json(NotificationsListResponse {
        notifications,
        unread_count,
    }))
}

// PATCH /api/notifications/:id/read
async fn mark_notification_read(
    State(state): State<AppState>,
    AuthUser(user): AuthUser,
    Path(id): Path<String>,
) -> Result<Json<GenericMessageResponse>, AppError> {
    let notif = Notifications::find_by_id(&id)
        .filter(notifications::Column::UserId.eq(&user.id))
        .one(&state.db)
        .await?;

    if let Some(n) = notif {
        let mut n_act: notifications::ActiveModel = n.into();
        n_act.read = Set(true);
        n_act.update(&state.db).await?;
    }

    Ok(Json(GenericMessageResponse {
        message: "Notification marked as read".to_string(),
    }))
}

// POST /api/notifications/read-all
async fn mark_all_read(
    State(state): State<AppState>,
    AuthUser(user): AuthUser,
) -> Result<Json<GenericMessageResponse>, AppError> {
    notifications::Entity::update_many()
        .filter(notifications::Column::UserId.eq(&user.id))
        .filter(notifications::Column::Read.eq(false))
        .col_expr(notifications::Column::Read, Expr::value(true))
        .exec(&state.db)
        .await?;

    Ok(Json(GenericMessageResponse {
        message: "All notifications marked as read".to_string(),
    }))
}

// DELETE /api/notifications/clear-all
async fn clear_all(
    State(state): State<AppState>,
    AuthUser(user): AuthUser,
) -> Result<Json<GenericMessageResponse>, AppError> {
    notifications::Entity::delete_many()
        .filter(notifications::Column::UserId.eq(&user.id))
        .exec(&state.db)
        .await?;

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
    notifications::Entity::delete_many()
        .filter(notifications::Column::Id.eq(id))
        .filter(notifications::Column::UserId.eq(&user.id))
        .exec(&state.db)
        .await?;

    Ok(Json(GenericMessageResponse {
        message: "Notification deleted".to_string(),
    }))
}

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/api/notifications", get(list_notifications))
        .route("/api/notifications/{id}/read", patch(mark_notification_read))
        .route("/api/notifications/read-all", post(mark_all_read))
        .route("/api/notifications/clear-all", delete(clear_all))
        .route("/api/notifications/{id}", delete(delete_one))
}
