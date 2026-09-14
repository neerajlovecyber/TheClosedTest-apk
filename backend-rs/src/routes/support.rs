use axum::{
    extract::{Path, State},
    http::StatusCode,
    routing::{get, post},
    Json, Router,
};
use sea_orm::{
    ActiveModelTrait, ColumnTrait, Condition, EntityTrait, QueryFilter,
    QueryOrder, Set,
};
use serde::{Deserialize, Serialize};
use time::{format_description::well_known::Rfc3339, OffsetDateTime};
use uuid::Uuid;

use crate::auth::{AdminUser, AuthUser};
use crate::db::models::UserSummary;
use crate::entities::{
    admin_chats, admin_messages,
    prelude::{AdminChats, AdminMessages, Users},
    users,
};
use crate::error::AppError;
use crate::state::AppState;

// ── Response shapes ────────────────────────────────────────────────────────────

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

impl From<admin_chats::Model> for AdminChatResponse {
    fn from(c: admin_chats::Model) -> Self {
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

impl From<admin_messages::Model> for AdminMessageResponse {
    fn from(m: admin_messages::Model) -> Self {
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

// ── GET /api/admin/support/chats (Admin only) ─────────────────────────────────
// Matches: list all chats with non-empty last_message, ordered desc, with user join
// TS: adminChats.findMany({ where: ne(lastMessage,"") & isNotNull(lastMessage), orderBy: desc(updatedAt), with: { user } })
async fn list_admin_support_chats(
    State(state): State<AppState>,
    _admin: AdminUser,
) -> Result<Json<Vec<AdminChatWithUserResponse>>, AppError> {
    // Fetch all chats where last_message != '' (matches TS: ne & isNotNull)
    let chats = AdminChats::find()
        .filter(admin_chats::Column::LastMessage.ne(""))
        .order_by_desc(admin_chats::Column::UpdatedAt)
        .all(&state.db)
        .await
        .map_err(AppError::from)?;

    let mut result = Vec::with_capacity(chats.len());
    for chat in chats {
        // LEFT JOIN users ON user_id = users.id (matches TS with: { user: { columns: id, name, email, avatarUrl } })
        let user = Users::find()
            .filter(users::Column::Id.eq(&chat.user_id))
            .one(&state.db)
            .await
            .ok()
            .flatten()
            .map(|u| UserSummary {
                id: u.id,
                name: Some(u.name),
                email: Some(u.email),
                avatar_url: u.avatar_url,
                reputation: Some(u.reputation),
            });

        result.push(AdminChatWithUserResponse {
            id: chat.id,
            user_id: chat.user_id,
            admin_id: chat.admin_id,
            last_message: chat.last_message,
            updated_at: chat.updated_at.format(&Rfc3339).unwrap_or_default(),
            has_unread_user: chat.has_unread_user,
            has_unread_admin: chat.has_unread_admin,
            user,
        });
    }

    Ok(Json(result))
}

// ── POST /api/admin/support/chats/user/:userId (Admin only) ───────────────────
// TS: get-or-create chat for a specific user
async fn get_or_create_user_chat_admin(
    State(state): State<AppState>,
    admin: AdminUser,
    Path(target_user_id): Path<String>,
) -> Result<Json<AdminChatResponse>, AppError> {
    // Verify target user exists (id OR tokenIdentifier – matches TS)
    let target_user = Users::find()
        .filter(
            Condition::any()
                .add(users::Column::Id.eq(&target_user_id))
                .add(users::Column::TokenIdentifier.eq(&target_user_id)),
        )
        .one(&state.db)
        .await
        .map_err(AppError::from)?
        .ok_or_else(|| AppError::NotFound("User not found".to_string()))?;

    // Look for existing chat (id OR token_identifier as user_id – matches TS)
    let existing = AdminChats::find()
        .filter(
            Condition::any()
                .add(admin_chats::Column::UserId.eq(&target_user.id))
                .add(admin_chats::Column::UserId.eq(target_user.token_identifier.as_deref().unwrap_or(""))),
        )
        .one(&state.db)
        .await
        .map_err(AppError::from)?;

    if let Some(chat) = existing {
        return Ok(Json(chat.into()));
    }

    let new_chat = admin_chats::ActiveModel {
        id: Set(Uuid::new_v4().to_string()),
        user_id: Set(target_user.id),
        admin_id: Set(Some(admin.id.clone())),
        last_message: Set(String::new()),
        updated_at: Set(OffsetDateTime::now_utc()),
        has_unread_user: Set(false),
        has_unread_admin: Set(false),
    }
    .insert(&state.db)
    .await
    .map_err(AppError::from)?;

    Ok(Json(new_chat.into()))
}

// ── POST /api/support/my-chat (Authenticated user) ───────────────────────────
// TS: get-or-create the calling user's own chat
async fn get_or_create_my_chat(
    State(state): State<AppState>,
    AuthUser(user): AuthUser,
) -> Result<Json<AdminChatResponse>, AppError> {
    // Matches TS: or(eq(userId, user.id), eq(userId, user.tokenIdentifier))
    let existing = AdminChats::find()
        .filter(
            Condition::any()
                .add(admin_chats::Column::UserId.eq(&user.id))
                .add(admin_chats::Column::UserId.eq(user.token_identifier.as_deref().unwrap_or(""))),
        )
        .one(&state.db)
        .await
        .map_err(AppError::from)?;

    if let Some(chat) = existing {
        return Ok(Json(chat.into()));
    }

    let new_chat = admin_chats::ActiveModel {
        id: Set(Uuid::new_v4().to_string()),
        user_id: Set(user.id.clone()),
        admin_id: Set(None),
        last_message: Set(String::new()),
        updated_at: Set(OffsetDateTime::now_utc()),
        has_unread_user: Set(false),
        has_unread_admin: Set(false),
    }
    .insert(&state.db)
    .await
    .map_err(AppError::from)?;

    Ok(Json(new_chat.into()))
}

// ── GET /api/support/chats/:chatId (AuthUser: Owner or Admin) ─────────────────
// TS: get chat + messages; mark read on open; auth owner or admin
async fn get_chat_details(
    State(state): State<AppState>,
    AuthUser(user): AuthUser,
    Path(chat_id): Path<String>,
) -> Result<Json<ChatDetailsResponse>, AppError> {
    let mut chat = AdminChats::find_by_id(&chat_id)
        .one(&state.db)
        .await
        .map_err(AppError::from)?
        .ok_or_else(|| AppError::NotFound("Chat not found".to_string()))?;

    let is_admin = user.is_admin;
    let is_owner = chat.user_id == user.id
        || user
            .token_identifier
            .as_deref()
            .map_or(false, |tid| chat.user_id == tid);

    if !is_owner && !is_admin {
        return Err(AppError::Forbidden("Forbidden".to_string()));
    }

    // Mark as read when opened (matches TS updateData pattern)
    let mut update = admin_chats::ActiveModel {
        id: Set(chat.id.clone()),
        ..Default::default()
    };
    let mut dirty = false;
    if is_admin && chat.has_unread_admin {
        update.has_unread_admin = Set(false);
        chat.has_unread_admin = false;
        dirty = true;
    }
    if is_owner && chat.has_unread_user {
        update.has_unread_user = Set(false);
        chat.has_unread_user = false;
        dirty = true;
    }
    if dirty {
        let _ = update.update(&state.db).await;
    }

    let messages = AdminMessages::find()
        .filter(admin_messages::Column::ChatId.eq(&chat_id))
        .order_by_asc(admin_messages::Column::SentAt)
        .all(&state.db)
        .await
        .map_err(AppError::from)?;

    Ok(Json(ChatDetailsResponse {
        chat: chat.into(),
        messages: messages.into_iter().map(AdminMessageResponse::from).collect(),
    }))
}

// ── POST /api/support/chats/:chatId/messages (AuthUser: Owner or Admin) ───────
// TS: isSendingAsAdmin = isAdmin && !isOwner; updates hasUnreadUser/Admin accordingly
async fn send_support_message(
    State(state): State<AppState>,
    AuthUser(user): AuthUser,
    Path(chat_id): Path<String>,
    Json(payload): Json<SendMessageRequest>,
) -> Result<(StatusCode, Json<AdminMessageResponse>), AppError> {
    let chat = AdminChats::find_by_id(&chat_id)
        .one(&state.db)
        .await
        .map_err(AppError::from)?
        .ok_or_else(|| AppError::NotFound("Chat not found".to_string()))?;

    let is_admin = user.is_admin;
    let is_owner = chat.user_id == user.id
        || user
            .token_identifier
            .as_deref()
            .map_or(false, |tid| chat.user_id == tid);

    if !is_owner && !is_admin {
        return Err(AppError::Forbidden("Forbidden".to_string()));
    }

    // If sender is owner of this chat, they send as user (even if admin role)
    let is_sending_as_admin = is_admin && !is_owner;

    let now = OffsetDateTime::now_utc();
    let new_msg = admin_messages::ActiveModel {
        id: Set(Uuid::new_v4().to_string()),
        chat_id: Set(chat_id.clone()),
        sender_id: Set(user.id.clone()),
        content: Set(payload.content.clone()),
        r#type: Set(payload.r#type.clone()),
        is_admin: Set(is_sending_as_admin),
        sent_at: Set(now),
    }
    .insert(&state.db)
    .await
    .map_err(AppError::from)?;

    // Update chat metadata (matches TS exactly)
    let admin_id_val = if is_sending_as_admin {
        Some(user.id.clone())
    } else {
        chat.admin_id.clone()
    };
    let _ = admin_chats::ActiveModel {
        id: Set(chat_id.clone()),
        last_message: Set(payload.content.clone()),
        has_unread_user: Set(is_sending_as_admin),
        has_unread_admin: Set(!is_sending_as_admin),
        admin_id: Set(admin_id_val),
        updated_at: Set(OffsetDateTime::now_utc()),
        ..Default::default()
    }
    .update(&state.db)
    .await;

    Ok((StatusCode::CREATED, Json(AdminMessageResponse::from(new_msg))))
}

// ── POST /api/admin/support/chats/:userId/messages (Admin only) ───────────────
// TS: get-or-create the user's chat, send an admin message
async fn send_admin_user_support_message(
    State(state): State<AppState>,
    admin: AdminUser,
    Path(target_user_id): Path<String>,
    Json(payload): Json<SendMessageRequest>,
) -> Result<(StatusCode, Json<AdminMessageResponse>), AppError> {
    let target_user = Users::find()
        .filter(
            Condition::any()
                .add(users::Column::Id.eq(&target_user_id))
                .add(users::Column::TokenIdentifier.eq(&target_user_id)),
        )
        .one(&state.db)
        .await
        .map_err(AppError::from)?
        .ok_or_else(|| AppError::NotFound("User not found".to_string()))?;

    // Get or create chat
    let chat = {
        let existing = AdminChats::find()
            .filter(
                Condition::any()
                    .add(admin_chats::Column::UserId.eq(&target_user.id))
                    .add(admin_chats::Column::UserId.eq(target_user.token_identifier.as_deref().unwrap_or(""))),
            )
            .one(&state.db)
            .await
            .map_err(AppError::from)?;

        match existing {
            Some(c) => c,
            None => admin_chats::ActiveModel {
                id: Set(Uuid::new_v4().to_string()),
                user_id: Set(target_user.id.clone()),
                admin_id: Set(Some(admin.id.clone())),
                last_message: Set(String::new()),
                updated_at: Set(OffsetDateTime::now_utc()),
                has_unread_user: Set(false),
                has_unread_admin: Set(false),
            }
            .insert(&state.db)
            .await
            .map_err(AppError::from)?,
        }
    };

    let now = OffsetDateTime::now_utc();
    let new_msg = admin_messages::ActiveModel {
        id: Set(Uuid::new_v4().to_string()),
        chat_id: Set(chat.id.clone()),
        sender_id: Set(admin.id.clone()),
        content: Set(payload.content.clone()),
        r#type: Set(payload.r#type.clone()),
        is_admin: Set(true),
        sent_at: Set(now),
    }
    .insert(&state.db)
    .await
    .map_err(AppError::from)?;

    // Update chat: admin sent → hasUnreadUser = true, hasUnreadAdmin = false
    let _ = admin_chats::ActiveModel {
        id: Set(chat.id.clone()),
        last_message: Set(payload.content.clone()),
        has_unread_user: Set(true),
        has_unread_admin: Set(false),
        admin_id: Set(Some(admin.id.clone())),
        updated_at: Set(OffsetDateTime::now_utc()),
        ..Default::default()
    }
    .update(&state.db)
    .await;

    Ok((StatusCode::CREATED, Json(AdminMessageResponse::from(new_msg))))
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
        .route(
            "/api/admin/support/chats/{userId}/messages",
            post(send_admin_user_support_message),
        )
        .route(
            "/admin/support/chats/{userId}/messages",
            post(send_admin_user_support_message),
        )
}
