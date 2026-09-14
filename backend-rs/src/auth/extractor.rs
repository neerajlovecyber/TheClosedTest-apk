use axum::{
    extract::FromRequestParts,
    http::request::Parts,
};
use std::ops::Deref;
use time::OffsetDateTime;
use uuid::Uuid;

use crate::auth::clerk::verify_token_payload;
use crate::db::models::User;
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

        // 2. Query Postgres
        let user_opt: Option<User> = sqlx::query_as::<_, User>(
            r#"SELECT id, token_identifier, name, email, avatar_url, reputation, apps_count,
                      push_token, is_group_member, is_admin, streak, best_streak,
                      last_check_in_date, unlocked_app_slots, created_at, updated_at
               FROM users WHERE token_identifier = $1"#,
        )
        .bind(&token_identifier)
        .fetch_optional(&state.pool)
        .await
        .map_err(AppError::Database)?;

        let user = match user_opt {
            Some(u) => u,
            None => {
                // 3. Auto-provision user on first valid token
                let new_id = Uuid::new_v4().to_string();
                let fallback_email = payload
                    .email
                    .unwrap_or_else(|| format!("{}@theclosedtest.app", token_identifier));
                let avatar = "https://ui-avatars.com/api/?name=Developer&background=random".to_string();

                let inserted = sqlx::query_as::<_, User>(
                    r#"INSERT INTO users (id, token_identifier, name, email, avatar_url, reputation, apps_count,
                                          is_group_member, is_admin, streak, best_streak, unlocked_app_slots,
                                          created_at, updated_at)
                       VALUES ($1, $2, $3, $4, $5, 100, 0, false, false, 0, 0, 3, NOW(), NOW())
                       ON CONFLICT (token_identifier) DO UPDATE SET updated_at = NOW()
                       RETURNING id, token_identifier, name, email, avatar_url, reputation, apps_count,
                                 push_token, is_group_member, is_admin, streak, best_streak,
                                 last_check_in_date, unlocked_app_slots, created_at, updated_at"#,
                )
                .bind(new_id)
                .bind(&token_identifier)
                .bind("Developer")
                .bind(fallback_email)
                .bind(avatar)
                .fetch_one(&state.pool)
                .await
                .map_err(AppError::Database)?;

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
