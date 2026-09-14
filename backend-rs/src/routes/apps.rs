use axum::{
    extract::{Path, Query, State},
    routing::{get, post},
    Json, Router,
};
use serde::{Deserialize, Serialize};
use sqlx::FromRow;
use time::{format_description::well_known::Rfc3339, OffsetDateTime};
use uuid::Uuid;
use validator::Validate;

use crate::auth::AuthUser;
use crate::db::models::{AppRecord, AppResponse, UserSummary};
use crate::error::AppError;
use crate::state::AppState;

#[derive(Deserialize)]
pub struct ListAppsQuery {
    pub search: Option<String>,
    pub limit: Option<i64>,
    pub offset: Option<i64>,
}

#[derive(Serialize, Deserialize, Clone)]
pub struct ListAppsResponse {
    pub apps: Vec<AppResponse>,
    pub total: i64,
}

#[derive(Deserialize, Validate)]
pub struct CreateAppRequest {
    #[validate(length(min = 2))]
    pub title: String,
    #[serde(rename = "packageName")]
    #[validate(length(min = 3))]
    pub package_name: String,
    #[serde(rename = "playStoreUrl")]
    #[validate(url)]
    pub play_store_url: String,
    #[serde(rename = "iconUrl")]
    #[validate(url)]
    pub icon_url: String,
    #[validate(length(min = 10))]
    pub instructions: String,
    #[serde(rename = "requiredTesters", default = "default_required_testers")]
    pub required_testers: i32,
}

fn default_required_testers() -> i32 {
    12
}

#[derive(Deserialize)]
pub struct VoteRequest {
    pub r#type: String,
}

#[derive(Serialize)]
pub struct GenericMessageResponse {
    pub message: String,
}

#[derive(FromRow)]
struct AppListRow {
    id: String,
    user_id: String,
    title: String,
    package_name: String,
    play_store_url: String,
    icon_url: String,
    instructions: String,
    required_testers: i32,
    status: String,
    completed_at: Option<OffsetDateTime>,
    flag_count: i32,
    visibility_status: Option<String>,
    positive_votes: i32,
    negative_votes: i32,
    voters: serde_json::Value,
    created_at: OffsetDateTime,
    updated_at: OffsetDateTime,
    user_name: Option<String>,
    user_email: Option<String>,
    user_avatar_url: Option<String>,
    user_reputation: Option<i32>,
    current_testers: Option<i32>,
}

#[derive(FromRow)]
struct MyAppRow {
    id: String,
    user_id: String,
    title: String,
    package_name: String,
    play_store_url: String,
    icon_url: String,
    instructions: String,
    required_testers: i32,
    status: String,
    completed_at: Option<OffsetDateTime>,
    flag_count: i32,
    visibility_status: Option<String>,
    positive_votes: i32,
    negative_votes: i32,
    voters: serde_json::Value,
    created_at: OffsetDateTime,
    updated_at: OffsetDateTime,
    current_testers: Option<i32>,
}

// GET /api/apps
async fn list_public_apps(
    State(state): State<AppState>,
    Query(params): Query<ListAppsQuery>,
) -> Result<Json<ListAppsResponse>, AppError> {
    let limit = params.limit.unwrap_or(20).clamp(1, 100);
    let offset = params.offset.unwrap_or(0).max(0);
    let search_pattern = params.search.as_ref().map(|s| format!("%{}%", s));
    let cache_key = format!("apps_list:{}:{}:{}", params.search.as_deref().unwrap_or(""), limit, offset);

    // 1. Check in-memory RAM cache (0 DB queries, 10s TTL)
    if let Some(cached_val) = state.api_cache.get(&cache_key).await {
        if let Ok(cached_res) = serde_json::from_value::<ListAppsResponse>(cached_val) {
            return Ok(Json(cached_res));
        }
    }

    let records = sqlx::query_as::<_, AppListRow>(
        r#"
        SELECT 
            a.id, a.user_id, a.title, a.package_name, a.play_store_url, a.icon_url,
            a.instructions, a.required_testers, a.status, a.completed_at, a.flag_count,
            a.visibility_status, a.positive_votes, a.negative_votes, a.voters,
            a.created_at, a.updated_at,
            u.name as user_name, u.email as user_email, u.avatar_url as user_avatar_url, u.reputation as user_reputation,
            COALESCE((
                SELECT COUNT(*)::int FROM matches m
                WHERE (m.app1_id = a.id OR m.app2_id = a.id) AND m.status = 'active'
            ), 0) as current_testers
        FROM apps a
        LEFT JOIN users u ON a.user_id = u.id
        WHERE a.status NOT IN ('archived', 'paused', 'completed')
          AND (a.visibility_status IN ('visible', 'unverified') OR a.visibility_status IS NULL)
          AND ($1::text IS NULL OR a.title ILIKE $1 OR a.package_name ILIKE $1)
        ORDER BY 
            CASE WHEN COALESCE((
                SELECT COUNT(*)::int FROM matches m
                WHERE (m.app1_id = a.id OR m.app2_id = a.id) AND m.status = 'active'
            ), 0) >= a.required_testers THEN 1 ELSE 0 END ASC,
            u.reputation DESC,
            a.created_at DESC
        LIMIT $2 OFFSET $3
        "#,
    )
    .bind(search_pattern.clone())
    .bind(limit)
    .bind(offset)
    .fetch_all(&state.pool)
    .await
    .map_err(AppError::Database)?;

    let total_count: (i64,) = sqlx::query_as(
        r#"
        SELECT COUNT(*)::bigint FROM apps a
        WHERE a.status NOT IN ('archived', 'paused', 'completed')
          AND (a.visibility_status IN ('visible', 'unverified') OR a.visibility_status IS NULL)
          AND ($1::text IS NULL OR a.title ILIKE $1 OR a.package_name ILIKE $1)
        "#,
    )
    .bind(search_pattern)
    .fetch_one(&state.pool)
    .await
    .map_err(AppError::Database)?;

    let apps: Vec<AppResponse> = records
        .into_iter()
        .map(|r| {
            let voters_vec: Vec<String> = serde_json::from_value(r.voters).unwrap_or_default();
            AppResponse {
                id: r.id,
                user_id: r.user_id.clone(),
                title: r.title,
                package_name: r.package_name,
                play_store_url: r.play_store_url,
                icon_url: r.icon_url,
                instructions: r.instructions,
                required_testers: r.required_testers,
                current_testers: r.current_testers.unwrap_or(0),
                status: r.status,
                completed_at: r.completed_at.map(|t| t.format(&Rfc3339).unwrap_or_default()),
                flag_count: r.flag_count,
                visibility_status: r.visibility_status,
                positive_votes: r.positive_votes,
                negative_votes: r.negative_votes,
                voters: voters_vec,
                created_at: r.created_at.format(&Rfc3339).unwrap_or_default(),
                updated_at: r.updated_at.format(&Rfc3339).unwrap_or_default(),
                user: Some(UserSummary {
                    id: r.user_id.clone(),
                    name: r.user_name,
                    email: r.user_email,
                    avatar_url: r.user_avatar_url,
                    reputation: r.user_reputation,
                }),
            }
        })
        .collect();

    let response = ListAppsResponse {
        apps,
        total: total_count.0,
    };

    // Store in RAM cache for 10 seconds
    if let Ok(json_val) = serde_json::to_value(&response) {
        state.api_cache.insert(cache_key, json_val).await;
    }

    Ok(Json(response))
}

// GET /api/apps/my
async fn list_my_apps(
    State(state): State<AppState>,
    AuthUser(user): AuthUser,
) -> Result<Json<Vec<AppResponse>>, AppError> {
    let records = sqlx::query_as::<_, MyAppRow>(
        r#"
        SELECT 
            a.id, a.user_id, a.title, a.package_name, a.play_store_url, a.icon_url,
            a.instructions, a.required_testers, a.status, a.completed_at, a.flag_count,
            a.visibility_status, a.positive_votes, a.negative_votes, a.voters,
            a.created_at, a.updated_at,
            COALESCE((
                SELECT COUNT(*)::int FROM matches m
                WHERE (m.app1_id = a.id OR m.app2_id = a.id) AND m.status = 'active'
            ), 0) as current_testers
        FROM apps a
        WHERE a.user_id = $1 AND a.status != 'archived'
        ORDER BY a.created_at DESC
        "#,
    )
    .bind(&user.id)
    .fetch_all(&state.pool)
    .await
    .map_err(AppError::Database)?;

    let apps: Vec<AppResponse> = records
        .into_iter()
        .map(|r| {
            let voters_vec: Vec<String> = serde_json::from_value(r.voters).unwrap_or_default();
            AppResponse {
                id: r.id,
                user_id: r.user_id,
                title: r.title,
                package_name: r.package_name,
                play_store_url: r.play_store_url,
                icon_url: r.icon_url,
                instructions: r.instructions,
                required_testers: r.required_testers,
                current_testers: r.current_testers.unwrap_or(0),
                status: r.status,
                completed_at: r.completed_at.map(|t| t.format(&Rfc3339).unwrap_or_default()),
                flag_count: r.flag_count,
                visibility_status: r.visibility_status,
                positive_votes: r.positive_votes,
                negative_votes: r.negative_votes,
                voters: voters_vec,
                created_at: r.created_at.format(&Rfc3339).unwrap_or_default(),
                updated_at: r.updated_at.format(&Rfc3339).unwrap_or_default(),
                user: Some(UserSummary {
                    id: user.id.clone(),
                    name: Some(user.name.clone()),
                    email: Some(user.email.clone()),
                    avatar_url: user.avatar_url.clone(),
                    reputation: Some(user.reputation),
                }),
            }
        })
        .collect();

    Ok(Json(apps))
}

// POST /api/apps
async fn create_app(
    State(state): State<AppState>,
    AuthUser(user): AuthUser,
    Json(payload): Json<CreateAppRequest>,
) -> Result<Json<AppResponse>, AppError> {
    payload.validate().map_err(|e| AppError::Validation(e.to_string()))?;

    let clean_pkg = payload.package_name.trim();

    // 1. Verify not banned
    let is_banned: Option<(String,)> = sqlx::query_as(
        "SELECT id FROM app_bans WHERE package_name = $1",
    )
    .bind(clean_pkg)
    .fetch_optional(&state.pool)
    .await
    .map_err(AppError::Database)?;

    if is_banned.is_some() {
        return Err(AppError::BadRequest("This app package has been banned from testing.".to_string()));
    }

    // 2. Verify not duplicate active
    let existing: Option<(String,)> = sqlx::query_as(
        "SELECT id FROM apps WHERE LOWER(package_name) = LOWER($1) AND status != 'archived'",
    )
    .bind(clean_pkg)
    .fetch_optional(&state.pool)
    .await
    .map_err(AppError::Database)?;

    if existing.is_some() {
        return Err(AppError::Conflict(format!("An app with package name '{}' is already registered.", clean_pkg)));
    }

    // 3. Verify user slot limit
    let active_apps_count: (i64,) = sqlx::query_as(
        "SELECT COUNT(*)::bigint FROM apps WHERE user_id = $1 AND status != 'archived'",
    )
    .bind(&user.id)
    .fetch_one(&state.pool)
    .await
    .map_err(AppError::Database)?;

    if (active_apps_count.0 as i32) >= user.unlocked_app_slots {
        return Err(AppError::BadRequest(format!(
            "You have reached your maximum active app limit ({}). Maintain your streak or test other apps to unlock more slots!",
            user.unlocked_app_slots
        )));
    }

    let new_id = Uuid::new_v4().to_string();
    let empty_voters = serde_json::json!([]);

    let app = sqlx::query_as::<_, AppRecord>(
        r#"
        INSERT INTO apps (
            id, user_id, title, package_name, play_store_url, icon_url, instructions,
            required_testers, status, flag_count, visibility_status, positive_votes,
            negative_votes, voters, created_at, updated_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'recruiting', 0, 'unverified', 0, 0, $9, NOW(), NOW())
        RETURNING id, user_id, title, package_name, play_store_url, icon_url, instructions,
                  required_testers, status, completed_at, flag_count, visibility_status,
                  positive_votes, negative_votes, voters, created_at, updated_at
        "#,
    )
    .bind(new_id)
    .bind(&user.id)
    .bind(payload.title.trim())
    .bind(clean_pkg)
    .bind(payload.play_store_url.trim())
    .bind(payload.icon_url.trim())
    .bind(payload.instructions.trim())
    .bind(payload.required_testers)
    .bind(empty_voters)
    .fetch_one(&state.pool)
    .await
    .map_err(AppError::Database)?;

    // Increment user's apps_count
    sqlx::query("UPDATE users SET apps_count = apps_count + 1 WHERE id = $1")
        .bind(&user.id)
        .execute(&state.pool)
        .await
        .map_err(AppError::Database)?;

    // Invalidate public apps list RAM cache
    state.api_cache.invalidate_all();

    Ok(Json(AppResponse {
        id: app.id,
        user_id: app.user_id,
        title: app.title,
        package_name: app.package_name,
        play_store_url: app.play_store_url,
        icon_url: app.icon_url,
        instructions: app.instructions,
        required_testers: app.required_testers,
        current_testers: 0,
        status: app.status,
        completed_at: None,
        flag_count: app.flag_count,
        visibility_status: app.visibility_status,
        positive_votes: app.positive_votes,
        negative_votes: app.negative_votes,
        voters: vec![],
        created_at: app.created_at.format(&Rfc3339).unwrap_or_default(),
        updated_at: app.updated_at.format(&Rfc3339).unwrap_or_default(),
        user: Some(UserSummary {
            id: user.id,
            name: Some(user.name),
            email: Some(user.email),
            avatar_url: user.avatar_url,
            reputation: Some(user.reputation),
        }),
    }))
}

// GET /api/apps/:id
async fn get_app_by_id(
    State(state): State<AppState>,
    Path(id): Path<String>,
) -> Result<Json<AppResponse>, AppError> {
    let r = sqlx::query_as::<_, AppListRow>(
        r#"
        SELECT 
            a.id, a.user_id, a.title, a.package_name, a.play_store_url, a.icon_url,
            a.instructions, a.required_testers, a.status, a.completed_at, a.flag_count,
            a.visibility_status, a.positive_votes, a.negative_votes, a.voters,
            a.created_at, a.updated_at,
            u.name as user_name, u.email as user_email, u.avatar_url as user_avatar_url, u.reputation as user_reputation,
            COALESCE((
                SELECT COUNT(*)::int FROM matches m
                WHERE (m.app1_id = a.id OR m.app2_id = a.id) AND m.status = 'active'
            ), 0) as current_testers
        FROM apps a
        LEFT JOIN users u ON a.user_id = u.id
        WHERE a.id = $1
        "#,
    )
    .bind(id)
    .fetch_optional(&state.pool)
    .await
    .map_err(AppError::Database)?
    .ok_or_else(|| AppError::NotFound("App not found".to_string()))?;

    let voters_vec: Vec<String> = serde_json::from_value(r.voters).unwrap_or_default();

    Ok(Json(AppResponse {
        id: r.id,
        user_id: r.user_id.clone(),
        title: r.title,
        package_name: r.package_name,
        play_store_url: r.play_store_url,
        icon_url: r.icon_url,
        instructions: r.instructions,
        required_testers: r.required_testers,
        current_testers: r.current_testers.unwrap_or(0),
        status: r.status,
        completed_at: r.completed_at.map(|t| t.format(&Rfc3339).unwrap_or_default()),
        flag_count: r.flag_count,
        visibility_status: r.visibility_status,
        positive_votes: r.positive_votes,
        negative_votes: r.negative_votes,
        voters: voters_vec,
        created_at: r.created_at.format(&Rfc3339).unwrap_or_default(),
        updated_at: r.updated_at.format(&Rfc3339).unwrap_or_default(),
        user: Some(UserSummary {
            id: r.user_id,
            name: r.user_name,
            email: r.user_email,
            avatar_url: r.user_avatar_url,
            reputation: r.user_reputation,
        }),
    }))
}

// POST /api/apps/:id/vote
async fn vote_app(
    State(state): State<AppState>,
    AuthUser(user): AuthUser,
    Path(id): Path<String>,
    Json(payload): Json<VoteRequest>,
) -> Result<Json<GenericMessageResponse>, AppError> {
    let app = sqlx::query_as::<_, AppRecord>("SELECT * FROM apps WHERE id = $1")
        .bind(&id)
        .fetch_optional(&state.pool)
        .await
        .map_err(AppError::Database)?
        .ok_or_else(|| AppError::NotFound("App not found".to_string()))?;

    let mut voters: Vec<String> = serde_json::from_value(app.voters).unwrap_or_default();
    if voters.contains(&user.id) {
        return Err(AppError::BadRequest("You have already voted on this app".to_string()));
    }

    voters.push(user.id);
    let is_positive = payload.r#type == "positive";
    let positive_votes = if is_positive { app.positive_votes + 1 } else { app.positive_votes };
    let negative_votes = if !is_positive { app.negative_votes + 1 } else { app.negative_votes };

    let mut visibility = app.visibility_status;
    if positive_votes >= 3 && positive_votes > negative_votes {
        visibility = Some("visible".to_string());
    } else if negative_votes >= 3 && negative_votes > positive_votes {
        visibility = Some("hidden".to_string());
    }

    let voters_json = serde_json::to_value(&voters).unwrap_or_default();
    sqlx::query(
        "UPDATE apps SET positive_votes = $1, negative_votes = $2, visibility_status = $3, voters = $4, updated_at = NOW() WHERE id = $5",
    )
    .bind(positive_votes)
    .bind(negative_votes)
    .bind(visibility)
    .bind(voters_json)
    .bind(id)
    .execute(&state.pool)
    .await
    .map_err(AppError::Database)?;

    // Invalidate public apps list RAM cache
    state.api_cache.invalidate_all();

    Ok(Json(GenericMessageResponse {
        message: "Vote recorded successfully".to_string(),
    }))
}

#[derive(Deserialize)]
pub struct UpdateAppRequest {
    pub title: Option<String>,
    #[serde(rename = "packageName")]
    pub package_name: Option<String>,
    #[serde(rename = "playStoreUrl")]
    pub play_store_url: Option<String>,
    #[serde(rename = "iconUrl")]
    pub icon_url: Option<String>,
    pub instructions: Option<String>,
    #[serde(rename = "requiredTesters")]
    pub required_testers: Option<i32>,
    pub status: Option<String>,
    #[serde(rename = "isMarketplaceVisible")]
    pub is_marketplace_visible: Option<bool>,
}

// PATCH /api/apps/:id
async fn update_app(
    State(state): State<AppState>,
    AuthUser(user): AuthUser,
    Path(id): Path<String>,
    Json(payload): Json<UpdateAppRequest>,
) -> Result<Json<AppResponse>, AppError> {
    let existing = sqlx::query_as::<_, AppRecord>("SELECT * FROM apps WHERE id = $1")
        .bind(&id)
        .fetch_optional(&state.pool)
        .await
        .map_err(AppError::Database)?
        .ok_or_else(|| AppError::NotFound("App not found".to_string()))?;

    if existing.user_id != user.id && !state.config.is_user_admin(Some(&user.email), user.is_admin) {
        return Err(AppError::Forbidden("Forbidden: Not owner of this app".to_string()));
    }

    let title = payload.title.unwrap_or(existing.title);
    let package_name = payload.package_name.unwrap_or(existing.package_name);
    let play_store_url = payload.play_store_url.clone().unwrap_or(existing.play_store_url);
    let icon_url = payload.icon_url.unwrap_or(existing.icon_url);
    let instructions = payload.instructions.unwrap_or(existing.instructions);
    let required_testers = payload.required_testers.unwrap_or(existing.required_testers);

    let mut status = payload.status.unwrap_or(existing.status);
    let mut visibility_status = existing.visibility_status;

    if let Some(visible) = payload.is_marketplace_visible {
        if !visible {
            status = "paused".to_string();
        } else {
            status = "recruiting".to_string();
            // Restore visibility if hidden
            if visibility_status.as_deref() == Some("hidden") {
                visibility_status = Some("visible".to_string());
            }
        }
    }

    // Self-healing: if playStoreUrl changed and app was hidden, restore it
    if payload.play_store_url.is_some() && visibility_status.as_deref() == Some("hidden") {
        visibility_status = Some("visible".to_string());
        if status == "paused" {
            status = "recruiting".to_string();
        }
    }

    let updated = sqlx::query_as::<_, AppRecord>(
        r#"
        UPDATE apps
        SET title = $1, package_name = $2, play_store_url = $3, icon_url = $4,
            instructions = $5, required_testers = $6, status = $7, visibility_status = $8,
            updated_at = NOW()
        WHERE id = $9
        RETURNING id, user_id, title, package_name, play_store_url, icon_url, instructions,
                  required_testers, status, completed_at, flag_count, visibility_status,
                  positive_votes, negative_votes, voters, created_at, updated_at
        "#,
    )
    .bind(title)
    .bind(package_name)
    .bind(play_store_url)
    .bind(icon_url)
    .bind(instructions)
    .bind(required_testers)
    .bind(status)
    .bind(visibility_status)
    .bind(&id)
    .fetch_one(&state.pool)
    .await
    .map_err(AppError::Database)?;

    // Invalidate public apps list RAM cache
    state.api_cache.invalidate_all();

    let voters_vec: Vec<String> = serde_json::from_value(updated.voters).unwrap_or_default();

    Ok(Json(AppResponse {
        id: updated.id,
        user_id: updated.user_id,
        title: updated.title,
        package_name: updated.package_name,
        play_store_url: updated.play_store_url,
        icon_url: updated.icon_url,
        instructions: updated.instructions,
        required_testers: updated.required_testers,
        current_testers: 0,
        status: updated.status,
        completed_at: updated.completed_at.map(|t| t.format(&Rfc3339).unwrap_or_default()),
        flag_count: updated.flag_count,
        visibility_status: updated.visibility_status,
        positive_votes: updated.positive_votes,
        negative_votes: updated.negative_votes,
        voters: voters_vec,
        created_at: updated.created_at.format(&Rfc3339).unwrap_or_default(),
        updated_at: updated.updated_at.format(&Rfc3339).unwrap_or_default(),
        user: Some(UserSummary {
            id: user.id,
            name: Some(user.name),
            email: Some(user.email),
            avatar_url: user.avatar_url,
            reputation: Some(user.reputation),
        }),
    }))
}

// DELETE /api/apps/:id
async fn delete_app(
    State(state): State<AppState>,
    AuthUser(user): AuthUser,
    Path(id): Path<String>,
) -> Result<Json<GenericMessageResponse>, AppError> {
    let existing = sqlx::query_as::<_, AppRecord>("SELECT * FROM apps WHERE id = $1")
        .bind(&id)
        .fetch_optional(&state.pool)
        .await
        .map_err(AppError::Database)?
        .ok_or_else(|| AppError::NotFound("App not found".to_string()))?;

    if existing.user_id != user.id && !state.config.is_user_admin(Some(&user.email), user.is_admin) {
        return Err(AppError::Forbidden("Forbidden: Not owner of this app".to_string()));
    }

    // Cascade delete associated matches, proofs, and messages
    let _ = sqlx::query(
        "DELETE FROM proofs WHERE match_id IN (SELECT id FROM matches WHERE app1_id = $1 OR app2_id = $1)",
    )
    .bind(&id)
    .execute(&state.pool)
    .await;

    let _ = sqlx::query(
        "DELETE FROM messages WHERE match_id IN (SELECT id FROM matches WHERE app1_id = $1 OR app2_id = $1)",
    )
    .bind(&id)
    .execute(&state.pool)
    .await;

    let _ = sqlx::query("DELETE FROM matches WHERE app1_id = $1 OR app2_id = $1")
        .bind(&id)
        .execute(&state.pool)
        .await;

    let _ = sqlx::query("DELETE FROM reports WHERE target_id = $1").bind(&id).execute(&state.pool).await;

    // Delete the app
    sqlx::query("DELETE FROM apps WHERE id = $1")
        .bind(&id)
        .execute(&state.pool)
        .await
        .map_err(AppError::Database)?;

    // Decrement user apps count
    let _ = sqlx::query("UPDATE users SET apps_count = GREATEST(0, apps_count - 1) WHERE id = $1")
        .bind(&existing.user_id)
        .execute(&state.pool)
        .await;

    // Invalidate public apps list RAM cache
    state.api_cache.invalidate_all();

    Ok(Json(GenericMessageResponse {
        message: "App deleted successfully".to_string(),
    }))
}

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/api/apps", get(list_public_apps).post(create_app))
        .route("/api/apps/my", get(list_my_apps))
        .route("/api/apps/{id}", get(get_app_by_id).patch(update_app).delete(delete_app))
        .route("/api/apps/{id}/vote", post(vote_app))
}
