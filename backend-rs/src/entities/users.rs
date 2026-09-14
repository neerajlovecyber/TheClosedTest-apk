use sea_orm::entity::prelude::*;
use serde::{Deserialize, Serialize};

#[derive(Clone, Debug, PartialEq, DeriveEntityModel, Eq, Serialize, Deserialize)]
#[sea_orm(table_name = "users")]
pub struct Model {
    #[sea_orm(primary_key, auto_increment = false)]
    pub id: String,
    pub token_identifier: Option<String>,
    pub name: String,
    pub email: String,
    pub avatar_url: Option<String>,
    pub reputation: i32,
    pub apps_count: i32,
    pub push_token: Option<String>,
    pub is_group_member: bool,
    pub is_admin: bool,
    pub streak: i32,
    pub best_streak: i32,
    pub last_check_in_date: Option<String>,
    pub unlocked_app_slots: i32,
    pub created_at: time::OffsetDateTime,
    pub updated_at: time::OffsetDateTime,
}

#[derive(Copy, Clone, Debug, EnumIter, DeriveRelation)]
pub enum Relation {
    #[sea_orm(has_many = "super::apps::Entity")]
    Apps,
    #[sea_orm(has_many = "super::proofs::Entity")]
    Proofs,
}

impl Related<super::apps::Entity> for Entity {
    fn to() -> RelationDef {
        Relation::Apps.def()
    }
}

impl Related<super::proofs::Entity> for Entity {
    fn to() -> RelationDef {
        Relation::Proofs.def()
    }
}

impl ActiveModelBehavior for ActiveModel {}
