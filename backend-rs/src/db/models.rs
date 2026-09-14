use serde::{Deserialize, Serialize};
use sqlx::FromRow;
use time::OffsetDateTime;

#[derive(Debug, Clone, Serialize, Deserialize, FromRow)]
pub struct User {
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
    #[serde(with = "time::serde::iso8601", rename = "createdAt")]
    pub created_at: OffsetDateTime,
    #[serde(with = "time::serde::iso8601", rename = "updatedAt")]
    pub updated_at: OffsetDateTime,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UserSummary {
    pub id: String,
    pub name: Option<String>,
    pub email: Option<String>,
    #[serde(rename = "avatarUrl")]
    pub avatar_url: Option<String>,
    pub reputation: Option<i32>,
}

#[derive(Debug, Clone, Serialize, Deserialize, FromRow)]
pub struct AppRecord {
    pub id: String,
    pub user_id: String,
    pub title: String,
    pub package_name: String,
    pub play_store_url: String,
    pub icon_url: String,
    pub instructions: String,
    pub required_testers: i32,
    pub status: String,
    #[serde(with = "time::serde::iso8601::option", default)]
    pub completed_at: Option<OffsetDateTime>,
    pub flag_count: i32,
    pub visibility_status: Option<String>,
    pub positive_votes: i32,
    pub negative_votes: i32,
    pub voters: serde_json::Value,
    #[serde(with = "time::serde::iso8601")]
    pub created_at: OffsetDateTime,
    #[serde(with = "time::serde::iso8601")]
    pub updated_at: OffsetDateTime,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AppResponse {
    pub id: String,
    #[serde(rename = "userId")]
    pub user_id: String,
    pub title: String,
    #[serde(rename = "packageName")]
    pub package_name: String,
    #[serde(rename = "playStoreUrl")]
    pub play_store_url: String,
    #[serde(rename = "iconUrl")]
    pub icon_url: String,
    pub instructions: String,
    #[serde(rename = "requiredTesters")]
    pub required_testers: i32,
    #[serde(rename = "currentTesters")]
    pub current_testers: i32,
    pub status: String,
    #[serde(rename = "completedAt")]
    pub completed_at: Option<String>,
    #[serde(rename = "flagCount")]
    pub flag_count: i32,
    #[serde(rename = "visibilityStatus")]
    pub visibility_status: Option<String>,
    #[serde(rename = "positiveVotes")]
    pub positive_votes: i32,
    #[serde(rename = "negativeVotes")]
    pub negative_votes: i32,
    pub voters: Vec<String>,
    #[serde(rename = "createdAt")]
    pub created_at: String,
    #[serde(rename = "updatedAt")]
    pub updated_at: String,
    pub user: Option<UserSummary>,
}

#[derive(Debug, Clone, Serialize, Deserialize, FromRow)]
#[serde(rename_all = "camelCase")]
pub struct MatchRecord {
    pub id: String,
    pub user1_id: String,
    pub app1_id: String,
    pub user2_id: String,
    pub app2_id: String,
    pub status: String,
    #[serde(with = "time::serde::iso8601::option", default)]
    pub start_date: Option<OffsetDateTime>,
    #[serde(with = "time::serde::iso8601")]
    pub last_activity: OffsetDateTime,
    #[serde(with = "time::serde::iso8601::option", default)]
    pub last_read1: Option<OffsetDateTime>,
    #[serde(with = "time::serde::iso8601::option", default)]
    pub last_read2: Option<OffsetDateTime>,
    #[serde(with = "time::serde::iso8601::option", default)]
    pub completed_at: Option<OffsetDateTime>,
    pub user1_approved_count: i32,
    pub user2_approved_count: i32,
    pub user1_last_proof: Option<serde_json::Value>,
    pub user2_last_proof: Option<serde_json::Value>,
    #[serde(with = "time::serde::iso8601")]
    pub created_at: OffsetDateTime,
    #[serde(with = "time::serde::iso8601")]
    pub updated_at: OffsetDateTime,
}

#[derive(Debug, Clone, Serialize, Deserialize, FromRow)]
#[serde(rename_all = "camelCase")]
pub struct ProofRecord {
    pub id: String,
    pub match_id: String,
    pub uploader_id: String,
    pub day: i32,
    pub r#type: String,
    pub storage_urls: serde_json::Value,
    pub status: String,
    pub comment: Option<String>,
    pub rejection_reason: Option<String>,
    #[serde(with = "time::serde::iso8601")]
    pub submitted_at: OffsetDateTime,
    #[serde(with = "time::serde::iso8601::option", default)]
    pub reviewed_at: Option<OffsetDateTime>,
}

#[derive(Debug, Clone, Serialize, Deserialize, FromRow)]
#[serde(rename_all = "camelCase")]
pub struct MessageRecord {
    pub id: String,
    pub match_id: String,
    pub sender_id: String,
    pub content: String,
    pub r#type: String,
    pub storage_url: Option<String>,
    #[serde(with = "time::serde::iso8601")]
    pub sent_at: OffsetDateTime,
}

#[derive(Debug, Clone, Serialize, Deserialize, FromRow)]
#[serde(rename_all = "camelCase")]
pub struct NotificationRecord {
    pub id: String,
    pub user_id: String,
    pub r#type: String,
    pub title: String,
    pub body: String,
    pub data: serde_json::Value,
    pub read: bool,
    #[serde(with = "time::serde::iso8601")]
    pub created_at: OffsetDateTime,
}

#[derive(Debug, Clone, Serialize, Deserialize, FromRow)]
#[serde(rename_all = "camelCase")]
pub struct AdminChatRecord {
    pub id: String,
    pub user_id: String,
    pub admin_id: Option<String>,
    pub last_message: String,
    #[serde(with = "time::serde::iso8601")]
    pub updated_at: OffsetDateTime,
    pub has_unread_user: bool,
    pub has_unread_admin: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, FromRow)]
#[serde(rename_all = "camelCase")]
pub struct AdminMessageRecord {
    pub id: String,
    pub chat_id: String,
    pub sender_id: String,
    pub content: String,
    pub r#type: String,
    pub is_admin: bool,
    #[serde(with = "time::serde::iso8601")]
    pub sent_at: OffsetDateTime,
}
