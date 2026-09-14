use sea_orm::entity::prelude::*;
use serde::{Deserialize, Serialize};

#[derive(Clone, Debug, PartialEq, DeriveEntityModel, Eq, Serialize, Deserialize)]
#[sea_orm(table_name = "admin_chats")]
pub struct Model {
    #[sea_orm(primary_key, auto_increment = false)]
    pub id: String,
    pub user_id: String,
    pub admin_id: Option<String>,
    pub last_message: String,
    pub updated_at: time::OffsetDateTime,
    pub has_unread_user: bool,
    pub has_unread_admin: bool,
}

#[derive(Copy, Clone, Debug, EnumIter, DeriveRelation)]
pub enum Relation {
    #[sea_orm(
        belongs_to = "super::users::Entity",
        from = "Column::UserId",
        to = "super::users::Column::Id"
    )]
    User,
    #[sea_orm(has_many = "super::admin_messages::Entity")]
    AdminMessages,
}

impl Related<super::users::Entity> for Entity {
    fn to() -> RelationDef {
        Relation::User.def()
    }
}

impl Related<super::admin_messages::Entity> for Entity {
    fn to() -> RelationDef {
        Relation::AdminMessages.def()
    }
}

impl ActiveModelBehavior for ActiveModel {}
