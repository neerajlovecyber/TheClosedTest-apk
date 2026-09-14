use axum::{
    extract::{Path, State},
    http::StatusCode,
    routing::{get, post},
    Json, Router,
};
use serde::{Deserialize, Serialize};
use time::{format_description::well_known::Rfc3339, OffsetDateTime};
use uuid::Uuid;

use crate::auth::{AdminUser, AuthUser};
use crate::db::models::{AdminChatRecord, AdminMessageRecord, UserSummary};
use crate::error::AppError;
use crate::state::AppState;

#[derive(Serialize)]
pub struct AdminChatResponse {
    pub id: String,
    #[serde(rename = "userId")]
    pub user_id: String,
    #[serde(rename = "adminId")]
    pub admin_id: Option<String>,
    #[serde(rename = "lastMessage")]
    pub last_message: String,
    #[serde(rename = "updatedAt")]
    pub updated_at: String,
    #[serde(rename = "hasUnreadUser")]
    pub has_unread_user: bool,
    #[serde(rename = "hasUnreadAdmin")]
    pub has_unread_admin: bool,
}

impl From<AdminChatRecord> for AdminChatResponse {
    fn from(c: AdminChatRecord) -> Self {
        Self {
            id: c.id,
            user_id: c.user_id,
            admin_id: c.admin_id,
            last_message: c.last_message,
            updated_at: c.updated_at.format(&Rfc3339).unwrap_or_default(),
            has_unread_user: c.has_unread_user,
            has_unread_admin: c.has_unread_admin,
        }
    }
}

#[derive(Serialize)]
pub struct AdminChatWithUserResponse {
    pub id: String,
    #[serde(rename = "userId")]
    pub user_id: String,
    #[serde(rename = "adminId")]
    pub admin_id: Option<String>,
    #[serde(rename = "lastMessage")]
    pub last_message: String,
    #[serde(rename = "updatedAt")]
    pub updated_at: String,
    #[serde(rename = "hasUnreadUser")]
    pub has_unread_user: bool,
    #[serde(rename = "hasUnreadAdmin")]
    pub has_unread_admin: bool,
    pub user: Option<UserSummary>,
}

#[derive(Serialize)]
pub struct AdminMessageResponse {
    pub id: String,
    #[serde(rename = "chatId")]
    pub chat_id: String,
    #[serde(rename = "senderId")]
    pub sender_id: String,
    pub content: String,
    pub r#type: String,
    #[serde(rename = "isAdmin")]
    pub is_admin: bool,
    #[serde(rename = "sentAt")]
    pub sent_at: String,
}

impl From<AdminMessageRecord> for AdminMessageResponse {
    fn from(m: AdminMessageRecord) -> Self {
        Self {
            id: m.id,
            chat_id: m.chat_id,
            sender_id: m.sender_id,
            content: m.content,
            r#type: m.r#type,
            is_admin: m.is_admin,
            sent_at: m.sent_at.format(&Rfc3339).unwrap_or_default(),
        }
    }
}

#[derive(Serialize)]
pub struct ChatDetailsResponse {
    pub chat: AdminChatResponse,
    pub messages: Vec<AdminMessageResponse>,
}

#[derive(Deserialize)]
pub struct SendMessageRequest {
    pub content: String,
    #[serde(default = "default_message_type")]
    pub r#type: String,
}

fn default_message_type() -> String {
    "text".to_string()
}

// POST /api/support/my-chat (Authenticated user)
async fn get_or_create_my_chat(
    State(state): State<AppState>,
    AuthUser(user): AuthUser,
) -> Result<Json<AdminChatResponse>, AppError> {
    let token_id = user.token_identifier.as_deref().unwrap_or("");
    let existing = sqlx::query_as::<_, AdminChatRecord>(
        "SELECT * FROM admin_chats WHERE user_id = $1 OR ($2 != '' AND user_id = $2) LIMIT 1",
    )
    .bind(&user.id)
    .bind(token_id)
    .fetch_optional(&state.pool)
    .await
    .map_err(AppError::Database)?;

    if let Some(chat) = existing {
        return Ok(Json(chat.into()));
    }

    let chat_id = Uuid::new_v4().to_string();
    let new_chat = sqlx::query_as::<_, AdminChatRecord>(
        r#"
        INSERT INTO admin_chats (id, user_id, last_message, updated_at, has_unread_user, has_unread_admin)
        VALUES ($1, $2, '', NOW(), false, false)
        RETURNING *
        "#,
    )
    .bind(chat_id)
    .bind(&user.id)
    .fetch_one(&state.pool)
    .await
    .map_err(AppError::Database)?;

    Ok(Json(new_chat.into()))
}

// GET /api/support/chats/{chat_id} (AuthUser: Owner or Admin)
async fn get_chat_details(
    State(state): State<AppState>,
    AuthUser(user): AuthUser,
    Path(chat_id): Path<String>,
) -> Result<Json<ChatDetailsResponse>, AppError> {
    let mut chat = sqlx::query_as::<_, AdminChatRecord>(
        "SELECT * FROM admin_chats WHERE id = $1",
    )
    .bind(&chat_id)
    .fetch_optional(&state.pool)
    .await
    .map_err(AppError::Database)?
    .ok_or_else(|| AppError::NotFound("Chat not found".to_string()))?;

    let is_admin = user.is_admin;
    let is_owner = chat.user_id == user.id
        || user.token_identifier.as_deref().map_or(false, |tid| chat.user_id == tid);

    if !is_owner && !is_admin {
        return Err(AppError::Forbidden("You do not have access to this support chat".to_string()));
    }

    // Mark as read when opened
    if is_admin && chat.has_unread_admin {
        chat.has_unread_admin = false;
        let _ = sqlx::query("UPDATE admin_chats SET has_unread_admin = false WHERE id = $1")
            .bind(&chat_id)
            .execute(&state.pool)
            .await;
    }
    if is_owner && chat.has_unread_user {
        chat.has_unread_user = false;
        let _ = sqlx::query("UPDATE admin_chats SET has_unread_user = false WHERE id = $1")
            .bind(&chat_id)
            .execute(&state.pool)
            .await;
    }

    let messages = sqlx::query_as::<_, AdminMessageRecord>(
        "SELECT * FROM admin_messages WHERE chat_id = $1 ORDER BY sent_at ASC",
    )
    .bind(&chat_id)
    .fetch_all(&state.pool)
    .await
    .map_err(AppError::Database)?;

    let messages_response = messages.into_iter().map(AdminMessageResponse::from).collect();

    Ok(Json(ChatDetailsResponse {
        chat: chat.into(),
        messages: messages_response,
    }))
}

// POST /api/support/chats/{chat_id}/messages (AuthUser: Owner or Admin)
async fn send_support_message(
    State(state): State<AppState>,
    AuthUser(user): AuthUser,
    Path(chat_id): Path<String>,
    Json(payload): Json<SendMessageRequest>,
) -> Result<(StatusCode, Json<AdminMessageResponse>), AppError> {
    let chat = sqlx::query_as::<_, AdminChatRecord>(
        "SELECT * FROM admin_chats WHERE id = $1",
    )
    .bind(&chat_id)
    .fetch_optional(&state.pool)
    .await
    .map_err(AppError::Database)?
    .ok_or_else(|| AppError::NotFound("Chat not found".to_string()))?;

    let is_admin = user.is_admin;
    let is_owner = chat.user_id == user.id
        || user.token_identifier.as_deref().map_or(false, |tid| chat.user_id == tid);

    if !is_owner && !is_admin {
        return Err(AppError::Forbidden("You do not have permission to send messages to this support chat".to_string()));
    }

    // If sender is owner, they are user even if account has admin role
    let is_sending_as_admin = is_admin && !is_owner;
    let msg_id = Uuid::new_v4().to_string();

    let new_msg = sqlx::query_as::<_, AdminMessageRecord>(
        r#"
        INSERT INTO admin_messages (id, chat_id, sender_id, content, type, is_admin, sent_at)
        VALUES ($1, $2, $3, $4, $5, $6, NOW())
        RETURNING *
        "#,
    )
    .bind(&msg_id)
    .bind(&chat_id)
    .bind(&user.id)
    .bind(&payload.content)
    .bind(&payload.r#type)
    .bind(is_sending_as_admin)
    .fetch_one(&state.pool)
    .await
    .map_err(AppError::Database)?;

    let admin_id = if is_sending_as_admin {
        Some(user.id)
    } else {
        chat.admin_id
    };

    sqlx::query(
        r#"
        UPDATE admin_chats
        SET last_message = $1,
            has_unread_user = $2,
            has_unread_admin = $3,
            admin_id = $4,
            updated_at = NOW()
        WHERE id = $5
        "#,
    )
    .bind(&payload.content)
    .bind(is_sending_as_admin)
    .bind(!is_sending_as_admin)
    .bind(admin_id)
    .bind(&chat_id)
    .execute(&state.pool)
    .await
    .map_err(AppError::Database)?;

    Ok((StatusCode::CREATED, Json(new_msg.into())))
}

// GET /api/admin/support/chats (Admin only)
async fn list_admin_support_chats(
    State(state): State<AppState>,
    _admin: AdminUser,
) -> Result<Json<Vec<AdminChatWithUserResponse>>, AppError> {
    #[derive(sqlx::FromRow)]
    struct ChatWithUserRow {
        id: String,
        user_id: String,
        admin_id: Option<String>,
        last_message: String,
        updated_at: OffsetDateTime,
        has_unread_user: bool,
        has_unread_admin: bool,
        u_id: Option<String>,
        u_name: Option<String>,
        u_email: Option<String>,
        u_avatar_url: Option<String>,
        u_reputation: Option<i32>,
    }

    let rows = sqlx::query_as::<_, ChatWithUserRow>(
        r#"
        SELECT c.id, c.user_id, c.admin_id, c.last_message, c.updated_at,
               c.has_unread_user, c.has_unread_admin,
               u.id as u_id, u.name as u_name, u.email as u_email,
               u.avatar_url as u_avatar_url, u.reputation as u_reputation
        FROM admin_chats c
        LEFT JOIN users u ON (c.user_id = u.id OR c.user_id = u.token_identifier)
        WHERE c.last_message != '' AND c.last_message IS NOT NULL
        ORDER BY c.updated_at DESC
        "#,
    )
    .fetch_all(&state.pool)
    .await
    .map_err(AppError::Database)?;

    let result = rows
        .into_iter()
        .map(|r| AdminChatWithUserResponse {
            id: r.id,
            user_id: r.user_id,
            admin_id: r.admin_id,
            last_message: r.last_message,
            updated_at: r.updated_at.format(&Rfc3339).unwrap_or_default(),
            has_unread_user: r.has_unread_user,
            has_unread_admin: r.has_unread_admin,
            user: r.u_id.map(|id| UserSummary {
                id,
                name: r.u_name,
                email: r.u_email,
                avatar_url: r.u_avatar_url,
                reputation: r.u_reputation,
            }),
        })
        .collect();

    Ok(Json(result))
}

// POST /api/admin/support/chats/user/{userId} (Admin only)
async fn get_or_create_user_chat_admin(
    State(state): State<AppState>,
    admin: AdminUser,
    Path(target_user_id): Path<String>,
) -> Result<Json<AdminChatResponse>, AppError> {
    // Verify target user exists
    let target_user = sqlx::query_as::<_, (String, Option<String>)>(
        "SELECT id, token_identifier FROM users WHERE id = $1 OR token_identifier = $1",
    )
    .bind(&target_user_id)
    .fetch_optional(&state.pool)
    .await
    .map_err(AppError::Database)?
    .ok_or_else(|| AppError::NotFound("User not found".to_string()))?;

    let token_id = target_user.1.as_deref().unwrap_or("");
    let existing = sqlx::query_as::<_, AdminChatRecord>(
        "SELECT * FROM admin_chats WHERE user_id = $1 OR ($2 != '' AND user_id = $2) LIMIT 1",
    )
    .bind(&target_user.0)
    .bind(token_id)
    .fetch_optional(&state.pool)
    .await
    .map_err(AppError::Database)?;

    if let Some(chat) = existing {
        return Ok(Json(chat.into()));
    }

    let chat_id = Uuid::new_v4().to_string();
    let new_chat = sqlx::query_as::<_, AdminChatRecord>(
        r#"
        INSERT INTO admin_chats (id, user_id, admin_id, last_message, updated_at, has_unread_user, has_unread_admin)
        VALUES ($1, $2, $3, '', NOW(), false, false)
        RETURNING *
        "#,
    )
    .bind(chat_id)
    .bind(&target_user.0)
    .bind(&admin.id)
    .fetch_one(&state.pool)
    .await
    .map_err(AppError::Database)?;

    Ok(Json(new_chat.into()))
}

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/api/support/my-chat", post(get_or_create_my_chat))
        .route("/api/support/chats/{chat_id}", get(get_chat_details))
        .route(
            "/api/support/chats/{chat_id}/messages",
            post(send_support_message),
        )
        .route("/api/admin/support/chats", get(list_admin_support_chats))
        .route(
            "/api/admin/support/chats/user/{userId}",
            post(get_or_create_user_chat_admin),
        )
}
