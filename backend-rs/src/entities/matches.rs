use sea_orm::entity::prelude::*;
use serde::{Deserialize, Serialize};

#[derive(Clone, Debug, PartialEq, DeriveEntityModel, Eq, Serialize, Deserialize)]
#[sea_orm(table_name = "matches")]
pub struct Model {
    #[sea_orm(primary_key, auto_increment = false)]
    pub id: String,
    pub user1_id: String,
    pub app1_id: String,
    pub user2_id: String,
    pub app2_id: String,
    pub status: String,
    pub start_date: Option<time::OffsetDateTime>,
    pub last_activity: time::OffsetDateTime,
    pub last_read1: Option<time::OffsetDateTime>,
    pub last_read2: Option<time::OffsetDateTime>,
    pub completed_at: Option<time::OffsetDateTime>,
    pub user1_approved_count: i32,
    pub user2_approved_count: i32,
    pub created_at: time::OffsetDateTime,
    pub updated_at: time::OffsetDateTime,
}

#[derive(Copy, Clone, Debug, EnumIter, DeriveRelation)]
pub enum Relation {
    #[sea_orm(
        belongs_to = "super::users::Entity",
        from = "Column::User1Id",
        to = "super::users::Column::Id"
    )]
    User1,
    #[sea_orm(
        belongs_to = "super::users::Entity",
        from = "Column::User2Id",
        to = "super::users::Column::Id"
    )]
    User2,
    #[sea_orm(
        belongs_to = "super::apps::Entity",
        from = "Column::App1Id",
        to = "super::apps::Column::Id"
    )]
    App1,
    #[sea_orm(
        belongs_to = "super::apps::Entity",
        from = "Column::App2Id",
        to = "super::apps::Column::Id"
    )]
    App2,
    #[sea_orm(has_many = "super::proofs::Entity")]
    Proofs,
    #[sea_orm(has_many = "super::messages::Entity")]
    Messages,
}

impl Related<super::proofs::Entity> for Entity {
    fn to() -> RelationDef {
        Relation::Proofs.def()
    }
}

impl Related<super::messages::Entity> for Entity {
    fn to() -> RelationDef {
        Relation::Messages.def()
    }
}

impl ActiveModelBehavior for ActiveModel {}
