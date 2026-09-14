use axum::{
    extract::{Path, Query, State},
    routing::{get, post},
    Json, Router,
};
use serde::{Deserialize, Serialize};
use time::format_description::well_known::Rfc3339;
use uuid::Uuid;

use crate::auth::AuthUser;
use crate::db::models::MessageRecord;
use crate::error::AppError;
use crate::state::AppState;

#[derive(Deserialize)]
pub struct ChatHistoryQuery {
    pub limit: Option<i64>,
    pub offset: Option<i64>,
}

#[derive(Deserialize)]
pub struct SendMessageRequest {
    pub content: String,
    #[serde(default = "default_type")]
    pub r#type: String,
    #[serde(rename = "storageUrl")]
    pub storage_url: Option<String>,
}

fn default_type() -> String {
    "text".to_string()
}

#[derive(Serialize)]
pub struct MessageResponse {
    pub id: String,
    #[serde(rename = "matchId")]
    pub match_id: String,
    #[serde(rename = "senderId")]
    pub sender_id: String,
    pub content: String,
    pub r#type: String,
    #[serde(rename = "storageUrl")]
    pub storage_url: Option<String>,
    #[serde(rename = "sentAt")]
    pub sent_at: String,
}

impl From<MessageRecord> for MessageResponse {
    fn from(m: MessageRecord) -> Self {
        Self {
            id: m.id,
            match_id: m.match_id,
            sender_id: m.sender_id,
            content: m.content,
            r#type: m.r#type,
            storage_url: m.storage_url,
            sent_at: m.sent_at.format(&Rfc3339).unwrap_or_default(),
        }
    }
}

#[derive(Serialize)]
pub struct GenericMessageResponse {
    pub message: String,
}

// GET /api/messages/:match_id
async fn get_chat_history(
    State(state): State<AppState>,
    AuthUser(user): AuthUser,
    Path(match_id): Path<String>,
    Query(params): Query<ChatHistoryQuery>,
) -> Result<Json<Vec<MessageResponse>>, AppError> {
    // Verify user is in match
    let match_row: Option<(String, String)> = sqlx::query_as(
        "SELECT user1_id, user2_id FROM matches WHERE id = $1",
    )
    .bind(&match_id)
    .fetch_optional(&state.pool)
    .await
    .map_err(AppError::Database)?;

    let (u1_id, u2_id) = match_row
        .ok_or_else(|| AppError::NotFound("Match not found".to_string()))?;

    if u1_id != user.id && u2_id != user.id && !state.config.is_user_admin(Some(&user.email), user.is_admin) {
        return Err(AppError::Forbidden("You are not a participant in this match chat".to_string()));
    }

    let limit = params.limit.unwrap_or(50).clamp(1, 100);
    let offset = params.offset.unwrap_or(0).max(0);

    let records = sqlx::query_as::<_, MessageRecord>(
        "SELECT id, match_id, sender_id, content, type, storage_url, sent_at FROM messages WHERE match_id = $1 ORDER BY sent_at DESC LIMIT $2 OFFSET $3",
    )
    .bind(&match_id)
    .bind(limit)
    .bind(offset)
    .fetch_all(&state.pool)
    .await
    .map_err(AppError::Database)?;

    let messages = records.into_iter().rev().map(MessageResponse::from).collect();
    Ok(Json(messages))
}

// POST /api/messages/:match_id
async fn send_message(
    State(state): State<AppState>,
    AuthUser(user): AuthUser,
    Path(match_id): Path<String>,
    Json(payload): Json<SendMessageRequest>,
) -> Result<Json<MessageResponse>, AppError> {
    let match_row: Option<(String, String)> = sqlx::query_as(
        "SELECT user1_id, user2_id FROM matches WHERE id = $1",
    )
    .bind(&match_id)
    .fetch_optional(&state.pool)
    .await
    .map_err(AppError::Database)?;

    let (u1_id, u2_id) = match_row
        .ok_or_else(|| AppError::NotFound("Match not found".to_string()))?;

    if u1_id != user.id && u2_id != user.id {
        return Err(AppError::Forbidden("You are not a participant in this match".to_string()));
    }

    let new_id = Uuid::new_v4().to_string();

    let record = sqlx::query_as::<_, MessageRecord>(
        r#"
        INSERT INTO messages (id, match_id, sender_id, content, type, storage_url, sent_at)
        VALUES ($1, $2, $3, $4, $5, $6, NOW())
        RETURNING id, match_id, sender_id, content, type, storage_url, sent_at
        "#,
    )
    .bind(new_id)
    .bind(&match_id)
    .bind(&user.id)
    .bind(payload.content.trim())
    .bind(payload.r#type)
    .bind(payload.storage_url)
    .fetch_one(&state.pool)
    .await
    .map_err(AppError::Database)?;

    // Update match last activity
    sqlx::query("UPDATE matches SET last_activity = NOW(), updated_at = NOW() WHERE id = $1")
        .bind(&match_id)
        .execute(&state.pool)
        .await
        .map_err(AppError::Database)?;

    Ok(Json(record.into()))
}

// POST /api/messages/:match_id/read
async fn mark_read(
    State(state): State<AppState>,
    AuthUser(user): AuthUser,
    Path(match_id): Path<String>,
) -> Result<Json<GenericMessageResponse>, AppError> {
    let match_row: Option<(String, String)> = sqlx::query_as(
        "SELECT user1_id, user2_id FROM matches WHERE id = $1",
    )
    .bind(&match_id)
    .fetch_optional(&state.pool)
    .await
    .map_err(AppError::Database)?;

    let (u1_id, u2_id) = match_row
        .ok_or_else(|| AppError::NotFound("Match not found".to_string()))?;

    if u1_id == user.id {
        sqlx::query("UPDATE matches SET last_read1 = NOW() WHERE id = $1")
            .bind(&match_id)
            .execute(&state.pool)
            .await
            .map_err(AppError::Database)?;
    } else if u2_id == user.id {
        sqlx::query("UPDATE matches SET last_read2 = NOW() WHERE id = $1")
            .bind(&match_id)
            .execute(&state.pool)
            .await
            .map_err(AppError::Database)?;
    } else {
        return Err(AppError::Forbidden("You are not a participant in this match".to_string()));
    }

    Ok(Json(GenericMessageResponse {
        message: "Chat marked as read".to_string(),
    }))
}

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/api/messages/:match_id", get(get_chat_history).post(send_message))
        .route("/api/messages/:match_id/read", post(mark_read))
}
