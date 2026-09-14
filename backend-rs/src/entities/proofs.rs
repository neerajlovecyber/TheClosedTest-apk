use sea_orm::entity::prelude::*;
use serde::{Deserialize, Serialize};

#[derive(Clone, Debug, PartialEq, DeriveEntityModel, Eq, Serialize, Deserialize)]
#[sea_orm(table_name = "proofs")]
pub struct Model {
    #[sea_orm(primary_key, auto_increment = false)]
    pub id: String,
    pub match_id: String,
    pub uploader_id: String,
    pub day: i32,
    #[sea_orm(column_name = "type")]
    pub r#type: String,
    pub storage_urls: serde_json::Value,
    pub status: String,
    pub comment: Option<String>,
    pub rejection_reason: Option<String>,
    pub submitted_at: time::OffsetDateTime,
    pub reviewed_at: Option<time::OffsetDateTime>,
}

#[derive(Copy, Clone, Debug, EnumIter, DeriveRelation)]
pub enum Relation {
    #[sea_orm(
        belongs_to = "super::matches::Entity",
        from = "Column::MatchId",
        to = "super::matches::Column::Id"
    )]
    Match,
    #[sea_orm(
        belongs_to = "super::users::Entity",
        from = "Column::UploaderId",
        to = "super::users::Column::Id"
    )]
    Uploader,
}

impl Related<super::matches::Entity> for Entity {
    fn to() -> RelationDef {
        Relation::Match.def()
    }
}

impl Related<super::users::Entity> for Entity {
    fn to() -> RelationDef {
        Relation::Uploader.def()
    }
}

impl ActiveModelBehavior for ActiveModel {}
