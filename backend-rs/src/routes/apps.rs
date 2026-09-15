use axum::{
    extract::{Path, Query, State},
    routing::{get, post},
    Json, Router,
};
use sea_orm::{
    ActiveModelTrait, ColumnTrait, DatabaseConnection, EntityTrait, PaginatorTrait,
    QueryFilter, QueryOrder, Set,
};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use time::{format_description::well_known::Rfc3339, OffsetDateTime};
use uuid::Uuid;
use validator::Validate;

use crate::auth::AuthUser;
use crate::db::models::{AppResponse, UserSummary};
use crate::entities::prelude::*;
use crate::entities::{app_bans, apps, matches, messages, proofs, users};
use crate::error::AppError;
use crate::state::AppState;

#[derive(Deserialize)]
pub struct ListAppsQuery {
    pub search: Option<String>,
    pub limit: Option<u64>,
    pub offset: Option<u64>,
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

pub async fn count_active_testers_for_app(db: &DatabaseConnection, app_id: &str) -> Result<i32, AppError> {
    let count = Matches::find()
        .filter(
            sea_orm::Condition::all()
                .add(
                    sea_orm::Condition::any()
                        .add(matches::Column::App1Id.eq(app_id))
                        .add(matches::Column::App2Id.eq(app_id)),
                )
                .add(matches::Column::Status.eq("active")),
        )
        .count(db)
        .await? as i32;
    Ok(count)
}

pub async fn get_active_tester_counts(
    db: &DatabaseConnection,
    app_ids: &[String],
) -> HashMap<String, i32> {
    let mut map = HashMap::new();
    if app_ids.is_empty() {
        return map;
    }
    let active_matches = Matches::find()
        .filter(
            sea_orm::Condition::all()
                .add(
                    sea_orm::Condition::any()
                        .add(matches::Column::App1Id.is_in(app_ids.to_vec()))
                        .add(matches::Column::App2Id.is_in(app_ids.to_vec())),
                )
                .add(matches::Column::Status.eq("active")),
        )
        .all(db)
        .await
        .unwrap_or_default();

    for m in active_matches {
        if app_ids.contains(&m.app1_id) {
            *map.entry(m.app1_id).or_insert(0) += 1;
        }
        if app_ids.contains(&m.app2_id) {
            *map.entry(m.app2_id).or_insert(0) += 1;
        }
    }
    map
}

// GET /api/apps
async fn list_public_apps(
    State(state): State<AppState>,
    Query(params): Query<ListAppsQuery>,
) -> Result<Json<ListAppsResponse>, AppError> {
    let limit = params.limit.unwrap_or(20).clamp(1, 100);
    let offset = params.offset.unwrap_or(0);
    let search_str = params.search.as_deref().unwrap_or("").trim();
    let cache_key = format!("apps_list:{}:{}:{}", search_str, limit, offset);

    // 1. Check in-memory RAM cache (0 DB queries, 10s TTL)
    if let Some(cached_val) = state.api_cache.get(&cache_key).await {
        if let Ok(cached_res) = serde_json::from_value::<ListAppsResponse>(cached_val) {
            return Ok(Json(cached_res));
        }
    }

    let mut query = Apps::find()
        .filter(apps::Column::Status.is_not_in(["archived", "paused", "completed"]))
        .filter(
            sea_orm::Condition::any()
                .add(apps::Column::VisibilityStatus.is_in(["visible", "unverified"]))
                .add(apps::Column::VisibilityStatus.is_null()),
        );

    if !search_str.is_empty() {
        let pat = format!("%{}%", search_str);
        query = query.filter(
            sea_orm::Condition::any()
                .add(apps::Column::Title.like(&pat))
                .add(apps::Column::PackageName.like(&pat)),
        );
    }

    let total_count = query.clone().count(&state.db).await? as i64;

    let app_models = query.all(&state.db).await?;
    let app_ids: Vec<String> = app_models.iter().map(|a| a.id.clone()).collect();
    let counts_map = get_active_tester_counts(&state.db, &app_ids).await;

    let user_ids: Vec<String> = app_models.iter().map(|a| a.user_id.clone()).collect();
    let users_map: HashMap<String, users::Model> = Users::find()
        .filter(users::Column::Id.is_in(user_ids))
        .all(&state.db)
        .await?
        .into_iter()
        .map(|u| (u.id.clone(), u))
        .collect();

    let mut app_responses: Vec<AppResponse> = app_models
        .into_iter()
        .map(|a| {
            let current_testers = counts_map.get(&a.id).copied().unwrap_or(0);
            let u = users_map.get(&a.user_id);
            let user_summary = u.map(|user| UserSummary {
                id: user.id.clone(),
                name: Some(user.name.clone()),
                email: Some(user.email.clone()),
                avatar_url: user.avatar_url.clone(),
                reputation: Some(user.reputation),
            });
            let voters_vec: Vec<String> = serde_json::from_value(a.voters).unwrap_or_default();
            AppResponse {
                id: a.id,
                user_id: a.user_id,
                title: a.title,
                package_name: a.package_name,
                play_store_url: a.play_store_url,
                icon_url: a.icon_url,
                instructions: a.instructions,
                required_testers: a.required_testers,
                current_testers,
                status: a.status,
                completed_at: a.completed_at.map(|t| t.format(&Rfc3339).unwrap_or_default()),
                flag_count: a.flag_count,
                visibility_status: a.visibility_status,
                positive_votes: a.positive_votes,
                negative_votes: a.negative_votes,
                voters: voters_vec,
                created_at: a.created_at.format(&Rfc3339).unwrap_or_default(),
                updated_at: a.updated_at.format(&Rfc3339).unwrap_or_default(),
                user: user_summary,
            }
        })
        .collect();

    // Sort by:
    // 1. Unfilled first (current_testers < required_testers)
    // 2. User reputation desc
    // 3. Created_at desc
    app_responses.sort_by(|a, b| {
        let filled_a = a.status == "filled" || a.current_testers >= a.required_testers;
        let filled_b = b.status == "filled" || b.current_testers >= b.required_testers;
        if filled_a != filled_b {
            return filled_a.cmp(&filled_b);
        }
        let rep_a = a.user.as_ref().and_then(|u| u.reputation).unwrap_or(100);
        let rep_b = b.user.as_ref().and_then(|u| u.reputation).unwrap_or(100);
        if rep_a != rep_b {
            return rep_b.cmp(&rep_a);
        }
        b.created_at.cmp(&a.created_at)
    });

    let paged_apps = app_responses
        .into_iter()
        .skip(offset as usize)
        .take(limit as usize)
        .collect();

    let response = ListAppsResponse {
        apps: paged_apps,
        total: total_count,
    };

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
    let app_models = Apps::find()
        .filter(apps::Column::UserId.eq(&user.id))
        .filter(apps::Column::Status.ne("archived"))
        .order_by_desc(apps::Column::CreatedAt)
        .all(&state.db)
        .await?;

    let app_ids: Vec<String> = app_models.iter().map(|a| a.id.clone()).collect();
    let counts_map = get_active_tester_counts(&state.db, &app_ids).await;

    let user_summary = UserSummary {
        id: user.id.clone(),
        name: Some(user.name.clone()),
        email: Some(user.email.clone()),
        avatar_url: user.avatar_url.clone(),
        reputation: Some(user.reputation),
    };

    let apps: Vec<AppResponse> = app_models
        .into_iter()
        .map(|a| {
            let current_testers = counts_map.get(&a.id).copied().unwrap_or(0);
            let voters_vec: Vec<String> = serde_json::from_value(a.voters).unwrap_or_default();
            AppResponse {
                id: a.id,
                user_id: a.user_id,
                title: a.title,
                package_name: a.package_name,
                play_store_url: a.play_store_url,
                icon_url: a.icon_url,
                instructions: a.instructions,
                required_testers: a.required_testers,
                current_testers,
                status: a.status,
                completed_at: a.completed_at.map(|t| t.format(&Rfc3339).unwrap_or_default()),
                flag_count: a.flag_count,
                visibility_status: a.visibility_status,
                positive_votes: a.positive_votes,
                negative_votes: a.negative_votes,
                voters: voters_vec,
                created_at: a.created_at.format(&Rfc3339).unwrap_or_default(),
                updated_at: a.updated_at.format(&Rfc3339).unwrap_or_default(),
                user: Some(user_summary.clone()),
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
    let is_banned = AppBans::find()
        .filter(app_bans::Column::PackageName.eq(clean_pkg))
        .one(&state.db)
        .await?;

    if is_banned.is_some() {
        return Err(AppError::BadRequest("This app package has been banned from testing.".to_string()));
    }

    // 2. Verify duplicate registration (case-insensitive)
    let existing = Apps::find()
        .filter(apps::Column::PackageName.like(clean_pkg))
        .filter(apps::Column::Status.ne("archived"))
        .one(&state.db)
        .await?;

    if existing.is_some() {
        return Err(AppError::Conflict(format!(
            "An app with package name '{}' is already registered in the system.",
            clean_pkg
        )));
    }

    // 3. Verify user slot limit
    let active_apps_count = Apps::find()
        .filter(apps::Column::UserId.eq(&user.id))
        .filter(apps::Column::Status.ne("archived"))
        .count(&state.db)
        .await? as i32;

    if active_apps_count >= user.unlocked_app_slots {
        return Err(AppError::BadRequest(format!(
            "You have reached your maximum active app limit ({}). Maintain your streak or test other apps to unlock more slots!",
            user.unlocked_app_slots
        )));
    }

    let new_id = Uuid::new_v4().to_string();
    let now = OffsetDateTime::now_utc();
    let empty_voters = serde_json::json!([]);

    let new_app = apps::ActiveModel {
        id: Set(new_id),
        user_id: Set(user.id.clone()),
        title: Set(payload.title.trim().to_string()),
        package_name: Set(clean_pkg.to_string()),
        play_store_url: Set(payload.play_store_url.trim().to_string()),
        icon_url: Set(payload.icon_url.trim().to_string()),
        instructions: Set(payload.instructions.trim().to_string()),
        required_testers: Set(payload.required_testers),
        status: Set("recruiting".to_string()),
        completed_at: Set(None),
        flag_count: Set(0),
        visibility_status: Set(Some("unverified".to_string())),
        positive_votes: Set(0),
        negative_votes: Set(0),
        voters: Set(empty_voters),
        created_at: Set(now),
        updated_at: Set(now),
    };

    let app = new_app.insert(&state.db).await?;

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
    let a = Apps::find_by_id(&id)
        .one(&state.db)
        .await?
        .ok_or_else(|| AppError::NotFound("App not found".to_string()))?;

    let current_testers = count_active_testers_for_app(&state.db, &a.id).await?;
    let user_model = Users::find_by_id(&a.user_id).one(&state.db).await?;
    let user_summary = user_model.map(|u| UserSummary {
        id: u.id,
        name: Some(u.name),
        email: Some(u.email),
        avatar_url: u.avatar_url,
        reputation: Some(u.reputation),
    });

    let voters_vec: Vec<String> = serde_json::from_value(a.voters).unwrap_or_default();

    Ok(Json(AppResponse {
        id: a.id,
        user_id: a.user_id,
        title: a.title,
        package_name: a.package_name,
        play_store_url: a.play_store_url,
        icon_url: a.icon_url,
        instructions: a.instructions,
        required_testers: a.required_testers,
        current_testers,
        status: a.status,
        completed_at: a.completed_at.map(|t| t.format(&Rfc3339).unwrap_or_default()),
        flag_count: a.flag_count,
        visibility_status: a.visibility_status,
        positive_votes: a.positive_votes,
        negative_votes: a.negative_votes,
        voters: voters_vec,
        created_at: a.created_at.format(&Rfc3339).unwrap_or_default(),
        updated_at: a.updated_at.format(&Rfc3339).unwrap_or_default(),
        user: user_summary,
    }))
}

// POST /api/apps/:id/vote
async fn vote_app(
    State(state): State<AppState>,
    AuthUser(user): AuthUser,
    Path(id): Path<String>,
    Json(payload): Json<VoteRequest>,
) -> Result<Json<GenericMessageResponse>, AppError> {
    let app = Apps::find_by_id(&id)
        .one(&state.db)
        .await?
        .ok_or_else(|| AppError::NotFound("App not found".to_string()))?;

    let mut voters: Vec<String> = serde_json::from_value(app.voters.clone()).unwrap_or_default();
    if voters.contains(&user.id) {
        return Err(AppError::BadRequest("You have already voted on this app".to_string()));
    }

    voters.push(user.id);
    let is_positive = payload.r#type == "positive";
    let positive_votes = if is_positive { app.positive_votes + 1 } else { app.positive_votes };
    let negative_votes = if !is_positive { app.negative_votes + 1 } else { app.negative_votes };

    let mut visibility = app.visibility_status.clone();
    if positive_votes >= 3 && positive_votes > negative_votes {
        visibility = Some("visible".to_string());
    } else if negative_votes >= 3 && negative_votes > positive_votes {
        visibility = Some("hidden".to_string());
    }

    let now = OffsetDateTime::now_utc();
    let mut app_act: apps::ActiveModel = app.into();
    app_act.positive_votes = Set(positive_votes);
    app_act.negative_votes = Set(negative_votes);
    app_act.visibility_status = Set(visibility);
    app_act.voters = Set(serde_json::to_value(&voters).unwrap_or_default());
    app_act.updated_at = Set(now);
    app_act.update(&state.db).await?;

    // Invalidate public apps list RAM cache
    state.api_cache.invalidate_all();

    Ok(Json(GenericMessageResponse {
        message: "Vote recorded successfully".to_string(),
    }))
}

// PATCH /api/apps/:id
async fn update_app(
    State(state): State<AppState>,
    AuthUser(user): AuthUser,
    Path(id): Path<String>,
    Json(payload): Json<UpdateAppRequest>,
) -> Result<Json<AppResponse>, AppError> {
    let existing = Apps::find_by_id(&id)
        .one(&state.db)
        .await?
        .ok_or_else(|| AppError::NotFound("App not found".to_string()))?;

    if existing.user_id != user.id && !state.config.is_user_admin(Some(&user.email), user.is_admin) {
        return Err(AppError::Forbidden("Forbidden: Not owner of this app".to_string()));
    }

    let now = OffsetDateTime::now_utc();
    let mut app_act: apps::ActiveModel = existing.clone().into();

    if let Some(title) = payload.title {
        app_act.title = Set(title);
    }
    if let Some(ref pkg) = payload.package_name {
        if !pkg.trim().is_empty() && pkg.trim().to_lowercase() != existing.package_name.to_lowercase() {
            let conflict = Apps::find()
                .filter(apps::Column::PackageName.like(pkg.trim()))
                .filter(apps::Column::Id.ne(&id))
                .filter(apps::Column::Status.ne("archived"))
                .one(&state.db)
                .await?;
            if conflict.is_some() {
                return Err(AppError::Conflict(format!("An app with package name '{}' is already registered in the system.", pkg.trim())));
            }
        }
        app_act.package_name = Set(pkg.trim().to_string());
    }
    if let Some(ps_url) = payload.play_store_url.clone() {
        app_act.play_store_url = Set(ps_url.trim().to_string());
    }
    if let Some(icon) = payload.icon_url {
        app_act.icon_url = Set(icon.trim().to_string());
    }
    if let Some(instr) = payload.instructions {
        app_act.instructions = Set(instr);
    }
    if let Some(req_t) = payload.required_testers {
        app_act.required_testers = Set(req_t);
    }

    let mut status = payload.status.clone().unwrap_or_else(|| existing.status.clone());
    let mut visibility_status = existing.visibility_status.clone();

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

    app_act.status = Set(status.clone());
    app_act.visibility_status = Set(visibility_status);
    app_act.updated_at = Set(now);

    // Parity with TS: Reward +20 reputation if status transitions to completed
    if status == "completed" && existing.status != "completed" {
        if let Some(u) = Users::find_by_id(&existing.user_id).one(&state.db).await? {
            let mut u_act: users::ActiveModel = u.into();
            u_act.reputation = Set(u_act.reputation.as_ref() + 20);
            u_act.updated_at = Set(now);
            let _ = u_act.update(&state.db).await;
        }
    }

    let updated = app_act.update(&state.db).await?;
    state.api_cache.invalidate_all();

    let current_testers = count_active_testers_for_app(&state.db, &updated.id).await?;
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
        current_testers,
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
    let existing = Apps::find_by_id(&id)
        .one(&state.db)
        .await?
        .ok_or_else(|| AppError::NotFound("App not found".to_string()))?;

    if existing.user_id != user.id && !state.config.is_user_admin(Some(&user.email), user.is_admin) {
        return Err(AppError::Forbidden("Forbidden: Not owner of this app".to_string()));
    }

    // Cascade delete associated matches, proofs, and messages
    let matches_to_delete = Matches::find()
        .filter(
            sea_orm::Condition::any()
                .add(matches::Column::App1Id.eq(&id))
                .add(matches::Column::App2Id.eq(&id)),
        )
        .all(&state.db)
        .await?;

    let match_ids: Vec<String> = matches_to_delete.iter().map(|m| m.id.clone()).collect();
    if !match_ids.is_empty() {
        let _ = Proofs::delete_many()
            .filter(proofs::Column::MatchId.is_in(match_ids.clone()))
            .exec(&state.db)
            .await;

        let _ = Messages::delete_many()
            .filter(messages::Column::MatchId.is_in(match_ids.clone()))
            .exec(&state.db)
            .await;

        let _ = Matches::delete_many()
            .filter(matches::Column::Id.is_in(match_ids))
            .exec(&state.db)
            .await;
    }

    // Delete the app
    let app_act: apps::ActiveModel = existing.clone().into();
    app_act.delete(&state.db).await?;

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
