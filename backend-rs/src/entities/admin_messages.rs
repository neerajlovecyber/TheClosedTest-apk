use sea_orm::entity::prelude::*;
use serde::{Deserialize, Serialize};

#[derive(Clone, Debug, PartialEq, DeriveEntityModel, Eq, Serialize, Deserialize)]
#[sea_orm(table_name = "admin_messages")]
pub struct Model {
    #[sea_orm(primary_key, auto_increment = false)]
    pub id: String,
    pub chat_id: String,
    pub sender_id: String,
    pub content: String,
    #[sea_orm(column_name = "type")]
    pub r#type: String,
    pub is_admin: bool,
    pub sent_at: time::OffsetDateTime,
}

#[derive(Copy, Clone, Debug, EnumIter, DeriveRelation)]
pub enum Relation {
    #[sea_orm(
        belongs_to = "super::admin_chats::Entity",
        from = "Column::ChatId",
        to = "super::admin_chats::Column::Id"
    )]
    AdminChat,
}

impl Related<super::admin_chats::Entity> for Entity {
    fn to() -> RelationDef {
        Relation::AdminChat.def()
    }
}

impl ActiveModelBehavior for ActiveModel {}
