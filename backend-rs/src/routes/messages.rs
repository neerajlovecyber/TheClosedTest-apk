use axum::{
    extract::{Path, Query, State},
    routing::{get, post},
    Json, Router,
};
use sea_orm::{ActiveModelTrait, ColumnTrait, EntityTrait, QueryFilter, QueryOrder, QuerySelect, Set};
use serde::{Deserialize, Serialize};
use time::{format_description::well_known::Rfc3339, OffsetDateTime};
use uuid::Uuid;

use crate::auth::AuthUser;
use crate::db::models::MessageRecord;
use crate::entities::prelude::*;
use crate::entities::{matches, messages};
use crate::error::AppError;
use crate::state::AppState;

#[derive(Deserialize)]
pub struct ChatHistoryQuery {
    pub limit: Option<u64>,
    pub offset: Option<u64>,
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

impl From<messages::Model> for MessageResponse {
    fn from(m: messages::Model) -> Self {
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
    let match_row = Matches::find_by_id(&match_id)
        .one(&state.db)
        .await?
        .ok_or_else(|| AppError::NotFound("Match not found".to_string()))?;

    if match_row.user1_id != user.id && match_row.user2_id != user.id && !state.config.is_user_admin(Some(&user.email), user.is_admin) {
        return Err(AppError::Forbidden("You are not a participant in this match chat".to_string()));
    }

    let limit = params.limit.unwrap_or(50).clamp(1, 100);
    let offset = params.offset.unwrap_or(0);

    let records = Messages::find()
        .filter(messages::Column::MatchId.eq(&match_id))
        .order_by_desc(messages::Column::SentAt)
        .limit(limit)
        .offset(offset)
        .all(&state.db)
        .await?;

    let messages: Vec<MessageResponse> = records.into_iter().rev().map(MessageResponse::from).collect();
    Ok(Json(messages))
}

// POST /api/messages/:match_id
async fn send_message(
    State(state): State<AppState>,
    AuthUser(user): AuthUser,
    Path(match_id): Path<String>,
    Json(payload): Json<SendMessageRequest>,
) -> Result<Json<MessageResponse>, AppError> {
    let match_row = Matches::find_by_id(&match_id)
        .one(&state.db)
        .await?
        .ok_or_else(|| AppError::NotFound("Match not found".to_string()))?;

    let is_user1 = match_row.user1_id == user.id;
    let is_user2 = match_row.user2_id == user.id;
    if !is_user1 && !is_user2 {
        return Err(AppError::Forbidden("You are not a participant in this match".to_string()));
    }

    let partner_id = if is_user1 { match_row.user2_id.clone() } else { match_row.user1_id.clone() };
    let new_id = Uuid::new_v4().to_string();
    let now = OffsetDateTime::now_utc();

    let msg_act = messages::ActiveModel {
        id: Set(new_id),
        match_id: Set(match_id.clone()),
        sender_id: Set(user.id.clone()),
        content: Set(payload.content.trim().to_string()),
        r#type: Set(payload.r#type),
        storage_url: Set(payload.storage_url),
        sent_at: Set(now),
    };

    let record = msg_act.insert(&state.db).await?;

    // Update match last activity and sender's last read timestamp
    let mut match_act: matches::ActiveModel = match_row.into();
    match_act.last_activity = Set(now);
    match_act.updated_at = Set(now);
    if is_user1 {
        match_act.last_read1 = Set(Some(now));
    } else {
        match_act.last_read2 = Set(Some(now));
    }
    let _ = match_act.update(&state.db).await;

    // Send push notification to peer partner
    if let Ok(Some(partner_user)) = Users::find_by_id(&partner_id).one(&state.db).await {
        if let Some(push_token) = partner_user.push_token {
            let push_client = reqwest::Client::new();
            let push_title = format!("Message from {}", user.name);
            let push_body = if record.r#type == "text" {
                record.content.clone()
            } else {
                "Sent an attachment".to_string()
            };
            let push_data = serde_json::json!({
                "matchId": match_id,
                "messageId": record.id,
            });
            tokio::spawn(async move {
                crate::services::push::send_push_notification(
                    &push_client,
                    &push_token,
                    push_title,
                    push_body,
                    push_data,
                ).await;
            });
        }
    }

    Ok(Json(record.into()))
}

// POST /api/messages/:match_id/read
async fn mark_read(
    State(state): State<AppState>,
    AuthUser(user): AuthUser,
    Path(match_id): Path<String>,
) -> Result<Json<GenericMessageResponse>, AppError> {
    let match_row = Matches::find_by_id(&match_id)
        .one(&state.db)
        .await?
        .ok_or_else(|| AppError::NotFound("Match not found".to_string()))?;

    let now = OffsetDateTime::now_utc();
    let mut match_act: matches::ActiveModel = match_row.clone().into();
    if match_row.user1_id == user.id {
        match_act.last_read1 = Set(Some(now));
    } else if match_row.user2_id == user.id {
        match_act.last_read2 = Set(Some(now));
    } else {
        return Err(AppError::Forbidden("You are not a participant in this match".to_string()));
    }

    match_act.update(&state.db).await?;

    Ok(Json(GenericMessageResponse {
        message: "Chat marked as read".to_string(),
    }))
}

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/api/messages/{match_id}", get(get_chat_history).post(send_message))
        .route("/api/messages/{match_id}/read", post(mark_read))
}
