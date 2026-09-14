use sea_orm::entity::prelude::*;
use serde::{Deserialize, Serialize};

#[derive(Clone, Debug, PartialEq, DeriveEntityModel, Eq, Serialize, Deserialize)]
#[sea_orm(table_name = "reports")]
pub struct Model {
    #[sea_orm(primary_key, auto_increment = false)]
    pub id: String,
    pub reporter_id: String,
    #[sea_orm(column_name = "type")]
    pub r#type: String,
    pub target_id: String,
    pub match_id: Option<String>,
    pub reported_user_id: Option<String>,
    pub reported_app_id: Option<String>,
    pub description: String,
    pub screenshots: serde_json::Value,
    pub status: String,
    pub admin_notes: Option<String>,
    pub action_taken: Option<String>,
    pub resolved_at: Option<time::OffsetDateTime>,
    pub created_at: time::OffsetDateTime,
}

#[derive(Copy, Clone, Debug, EnumIter, DeriveRelation)]
pub enum Relation {}

impl ActiveModelBehavior for ActiveModel {}
