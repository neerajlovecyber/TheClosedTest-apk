use axum::{
    extract::FromRequestParts,
    http::request::Parts,
};
use std::ops::Deref;
use time::OffsetDateTime;
use uuid::Uuid;

use sea_orm::{ActiveModelTrait, ColumnTrait, EntityTrait, QueryFilter, Set};

use crate::auth::clerk::verify_token_payload;
use crate::db::models::User;
use crate::entities::{prelude::*, users};
use crate::error::AppError;
use crate::state::AppState;

#[derive(Debug, Clone)]
pub struct AuthUser(pub User);

impl Deref for AuthUser {
    type Target = User;
    fn deref(&self) -> &Self::Target {
        &self.0
    }
}

impl FromRequestParts<AppState> for AuthUser {
    type Rejection = AppError;

    async fn from_request_parts(
        parts: &mut Parts,
        state: &AppState,
    ) -> Result<Self, Self::Rejection> {
        let auth_header = parts
            .headers
            .get(axum::http::header::AUTHORIZATION)
            .and_then(|h| h.to_str().ok())
            .ok_or_else(|| {
                AppError::Unauthorized("Missing or invalid Authorization header. Bearer token required.".to_string())
            })?;

        if !auth_header.starts_with("Bearer ") {
            return Err(AppError::Unauthorized(
                "Missing or invalid Authorization header. Bearer token required.".to_string(),
            ));
        }

        let raw_token = auth_header.trim_start_matches("Bearer ").trim();
        let payload = verify_token_payload(raw_token, state)
            .await
            .ok_or_else(|| {
                AppError::Unauthorized("Invalid, unverified, or expired authentication token".to_string())
            })?;

        let token_identifier = payload.sub;

        // 1. Check in-memory LRU cache (0 DB overhead)
        if let Some(cached_user) = state.user_cache.get(&token_identifier).await {
            state.presence_cache.insert(cached_user.id.clone(), OffsetDateTime::now_utc()).await;
            return Ok(AuthUser(cached_user));
        }

        // 2. Query Postgres via SeaORM
        let user_model = Users::find()
            .filter(users::Column::TokenIdentifier.eq(&token_identifier))
            .one(&state.db)
            .await
            .map_err(AppError::from)?;

        let user: User = match user_model {
            Some(u) => u.into(),
            None => {
                // 3. Auto-provision user on first valid token (matches TS auth.ts exactly)
                let new_id = Uuid::new_v4().to_string();
                let fallback_email = payload
                    .email
                    .unwrap_or_else(|| format!("{}@theclosedtest.app", token_identifier));
                let avatar = "https://ui-avatars.com/api/?name=Developer&background=random".to_string();
                let now = OffsetDateTime::now_utc();

                let new_user = users::ActiveModel {
                    id: Set(new_id),
                    token_identifier: Set(Some(token_identifier.clone())),
                    name: Set("Developer".to_string()),
                    email: Set(fallback_email),
                    avatar_url: Set(Some(avatar)),
                    reputation: Set(100),
                    apps_count: Set(0),
                    push_token: Set(None),
                    is_group_member: Set(false),
                    is_admin: Set(false),
                    streak: Set(0),
                    best_streak: Set(0),
                    last_check_in_date: Set(None),
                    unlocked_app_slots: Set(3),
                    created_at: Set(now),
                    updated_at: Set(now),
                };

                let inserted = match new_user.insert(&state.db).await {
                    Ok(u) => u.into(),
                    Err(_) => {
                        // On race conflict, fetch existing user
                        Users::find()
                            .filter(users::Column::TokenIdentifier.eq(&token_identifier))
                            .one(&state.db)
                            .await
                            .map_err(AppError::from)?
                            .ok_or_else(|| AppError::Internal("Failed to provision user".to_string()))?
                            .into()
                    }
                };

                inserted
            }
        };

        // Cache in memory for 60s
        state.user_cache.insert(token_identifier, user.clone()).await;
        state.presence_cache.insert(user.id.clone(), OffsetDateTime::now_utc()).await;

        Ok(AuthUser(user))
    }
}

#[derive(Debug, Clone)]
pub struct AdminUser(pub User);

impl Deref for AdminUser {
    type Target = User;
    fn deref(&self) -> &Self::Target {
        &self.0
    }
}

impl FromRequestParts<AppState> for AdminUser {
    type Rejection = AppError;

    async fn from_request_parts(
        parts: &mut Parts,
        state: &AppState,
    ) -> Result<Self, Self::Rejection> {
        let auth_user = AuthUser::from_request_parts(parts, state).await?;
        if !state.config.is_user_admin(Some(&auth_user.email), auth_user.is_admin) {
            return Err(AppError::Forbidden("Forbidden: Admin access required".to_string()));
        }
        Ok(AdminUser(auth_user.0))
    }
}

#[derive(Debug, Clone)]
pub struct OptionalUser(pub Option<User>);

impl FromRequestParts<AppState> for OptionalUser {
    type Rejection = AppError;

    async fn from_request_parts(
        parts: &mut Parts,
        state: &AppState,
    ) -> Result<Self, Self::Rejection> {
        match AuthUser::from_request_parts(parts, state).await {
            Ok(user) => Ok(OptionalUser(Some(user.0))),
            Err(_) => Ok(OptionalUser(None)),
        }
    }
}
