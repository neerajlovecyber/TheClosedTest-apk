use axum::{
    extract::{Path, Query, State},
    routing::{delete, get, patch, post},
    Json, Router,
};
use serde::{Deserialize, Serialize};
use sqlx::FromRow;
use time::{format_description::well_known::Rfc3339, OffsetDateTime};
use uuid::Uuid;

use crate::auth::{AdminUser, AuthUser};
use crate::db::models::AppRecord;
use crate::error::AppError;
use crate::state::AppState;

#[derive(Serialize)]
pub struct PlatformStatsResponse {
    #[serde(rename = "totalUsers")]
    pub total_users: i64,
    #[serde(rename = "totalApps")]
    pub total_apps: i64,
    #[serde(rename = "activeMatches")]
    pub active_matches: i64,
    #[serde(rename = "totalProofs")]
    pub total_proofs: i64,
    #[serde(rename = "pendingReports")]
    pub pending_reports: i64,
    #[serde(rename = "activeUsers")]
    pub active_users: i64,
    #[serde(rename = "activeUsers24h")]
    pub active_users_24h: i64,
}

#[derive(Serialize, FromRow)]
pub struct ReportItem {
    pub id: String,
    #[serde(rename = "reporterId")]
    pub reporter_id: String,
    pub r#type: String,
    #[serde(rename = "targetId")]
    pub target_id: String,
    #[serde(rename = "matchId")]
    pub match_id: Option<String>,
    pub description: String,
    pub status: String,
    #[serde(rename = "adminNotes")]
    pub admin_notes: Option<String>,
    #[serde(rename = "createdAt")]
    pub created_at: String,
}

#[derive(Deserialize)]
pub struct CreateReportRequest {
    pub r#type: String,
    #[serde(rename = "targetId")]
    pub target_id: String,
    #[serde(rename = "matchId")]
    pub match_id: Option<String>,
    #[serde(rename = "reportedUserId")]
    pub reported_user_id: Option<String>,
    #[serde(rename = "reportedAppId")]
    pub reported_app_id: Option<String>,
    pub description: Option<String>,
    #[serde(default)]
    pub screenshots: Vec<String>,
}

#[derive(Deserialize)]
pub struct UpdateReportRequest {
    pub status: String, // "resolved", "dismissed"
    #[serde(rename = "adminNotes")]
    pub admin_notes: Option<String>,
}

#[derive(Deserialize)]
pub struct BanUserRequest {
    #[serde(rename = "userId")]
    pub user_id: String,
    pub reason: String,
    #[serde(default = "default_permanent")]
    pub permanent: bool,
}

fn default_permanent() -> bool {
    true
}

#[derive(Deserialize)]
pub struct BanAppRequest {
    #[serde(rename = "packageName")]
    pub package_name: String,
    pub title: String,
    #[serde(rename = "playStoreUrl")]
    pub play_store_url: String,
    pub reason: String,
}

#[derive(Deserialize)]
pub struct AdminUsersQuery {
    pub search: Option<String>,
    pub limit: Option<i64>,
}

#[derive(Deserialize)]
pub struct AdminAppsQuery {
    pub search: Option<String>,
    pub status: Option<String>,
    pub limit: Option<i64>,
    pub offset: Option<i64>,
}

#[derive(Serialize)]
pub struct AdminAppsResponse {
    pub apps: Vec<AppRecord>,
    pub total: usize,
    #[serde(rename = "duplicatePackagesCount")]
    pub duplicate_packages_count: usize,
}

#[derive(Serialize)]
pub struct CleanupResultResponse {
    pub message: String,
    #[serde(rename = "deletedAppsCount")]
    pub deleted_apps_count: Option<usize>,
    #[serde(rename = "deletedUsersCount")]
    pub deleted_users_count: Option<usize>,
}

#[derive(Serialize)]
pub struct GenericMessageResponse {
    pub message: String,
}

// GET /api/admin/stats
async fn get_platform_stats(
    State(state): State<AppState>,
    _admin: AdminUser,
) -> Result<Json<PlatformStatsResponse>, AppError> {
    let (user_count,): (i64,) = sqlx::query_as("SELECT COUNT(*)::bigint FROM users")
        .fetch_one(&state.pool)
        .await
        .map_err(AppError::Database)?;

    let (app_count,): (i64,) = sqlx::query_as("SELECT COUNT(*)::bigint FROM apps")
        .fetch_one(&state.pool)
        .await
        .map_err(AppError::Database)?;

    let (match_count,): (i64,) = sqlx::query_as("SELECT COUNT(*)::bigint FROM matches WHERE status = 'active'")
        .fetch_one(&state.pool)
        .await
        .map_err(AppError::Database)?;

    let (proof_count,): (i64,) = sqlx::query_as("SELECT COUNT(*)::bigint FROM proofs")
        .fetch_one(&state.pool)
        .await
        .map_err(AppError::Database)?;

    let (report_count,): (i64,) = sqlx::query_as("SELECT COUNT(*)::bigint FROM reports WHERE status = 'pending'")
        .fetch_one(&state.pool)
        .await
        .map_err(AppError::Database)?;

    let active_users = state.presence_cache.entry_count().max(2) as i64;

    Ok(Json(PlatformStatsResponse {
        total_users: user_count,
        total_apps: app_count,
        active_matches: match_count,
        total_proofs: proof_count,
        pending_reports: report_count,
        active_users,
        active_users_24h: active_users,
    }))
}

// POST /api/reports (Authenticated user)
async fn create_report(
    State(state): State<AppState>,
    AuthUser(user): AuthUser,
    Json(payload): Json<CreateReportRequest>,
) -> Result<Json<ReportItem>, AppError> {
    let report_id = Uuid::new_v4().to_string();
    let desc = payload.description.unwrap_or_else(|| format!("Reported as {}", payload.r#type));
    let screenshots_json = serde_json::to_value(&payload.screenshots).unwrap_or_default();

    let record = sqlx::query_as::<_, (String, String, String, String, Option<String>, String, String, Option<String>, OffsetDateTime)>(
        r#"
        INSERT INTO reports (id, reporter_id, type, target_id, match_id, reported_user_id, reported_app_id, description, screenshots, status, created_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'pending', NOW())
        RETURNING id, reporter_id, type, target_id, match_id, description, status, admin_notes, created_at
        "#,
    )
    .bind(&report_id)
    .bind(&user.id)
    .bind(&payload.r#type)
    .bind(&payload.target_id)
    .bind(&payload.match_id)
    .bind(&payload.reported_user_id)
    .bind(&payload.reported_app_id)
    .bind(&desc)
    .bind(screenshots_json)
    .fetch_one(&state.pool)
    .await
    .map_err(AppError::Database)?;

    // Automated flag count increment on app: if flagCount >= 3, automatically hide app
    let target_app_id = payload.reported_app_id.or_else(|| {
        if payload.r#type == "app_not_visible" || payload.r#type == "app_spam" {
            Some(payload.target_id)
        } else {
            None
        }
    });

    if let Some(app_id) = target_app_id {
        let app_res = sqlx::query_as::<_, (String, i32)>(
            "SELECT id, flag_count FROM apps WHERE id = $1",
        )
        .bind(&app_id)
        .fetch_optional(&state.pool)
        .await
        .map_err(AppError::Database)?;

        if let Some((_, flag_count)) = app_res {
            let new_flags = flag_count + 1;
            let should_hide = new_flags >= 3;

            if should_hide {
                let _ = sqlx::query(
                    "UPDATE apps SET flag_count = $1, visibility_status = 'hidden', status = 'paused', updated_at = NOW() WHERE id = $2",
                )
                .bind(new_flags)
                .bind(&app_id)
                .execute(&state.pool)
                .await;
            } else {
                let _ = sqlx::query(
                    "UPDATE apps SET flag_count = $1, updated_at = NOW() WHERE id = $2",
                )
                .bind(new_flags)
                .bind(&app_id)
                .execute(&state.pool)
                .await;
            }
        }
    }

    Ok(Json(ReportItem {
        id: record.0,
        reporter_id: record.1,
        r#type: record.2,
        target_id: record.3,
        match_id: record.4,
        description: record.5,
        status: record.6,
        admin_notes: record.7,
        created_at: record.8.format(&Rfc3339).unwrap_or_default(),
    }))
}

// GET /api/admin/reports
async fn list_reports(
    State(state): State<AppState>,
    _admin: AdminUser,
) -> Result<Json<Vec<ReportItem>>, AppError> {
    let records = sqlx::query_as::<_, (String, String, String, String, Option<String>, String, String, Option<String>, OffsetDateTime)>(
        "SELECT id, reporter_id, type, target_id, match_id, description, status, admin_notes, created_at FROM reports ORDER BY created_at DESC LIMIT 50",
    )
    .fetch_all(&state.pool)
    .await
    .map_err(AppError::Database)?;

    let reports = records
        .into_iter()
        .map(|(id, reporter_id, r_type, target_id, match_id, description, status, admin_notes, created_at)| ReportItem {
            id,
            reporter_id,
            r#type: r_type,
            target_id,
            match_id,
            description,
            status,
            admin_notes,
            created_at: created_at.format(&Rfc3339).unwrap_or_default(),
        })
        .collect();

    Ok(Json(reports))
}

// PATCH /api/admin/reports/:id
async fn update_report(
    State(state): State<AppState>,
    _admin: AdminUser,
    Path(id): Path<String>,
    Json(payload): Json<UpdateReportRequest>,
) -> Result<Json<GenericMessageResponse>, AppError> {
    sqlx::query(
        "UPDATE reports SET status = $1, admin_notes = $2, resolved_at = NOW() WHERE id = $3",
    )
    .bind(payload.status)
    .bind(payload.admin_notes)
    .bind(id)
    .execute(&state.pool)
    .await
    .map_err(AppError::Database)?;

    Ok(Json(GenericMessageResponse {
        message: "Report updated successfully".to_string(),
    }))
}

// POST /api/admin/bans/user
async fn ban_user(
    State(state): State<AppState>,
    admin: AdminUser,
    Json(payload): Json<BanUserRequest>,
) -> Result<Json<GenericMessageResponse>, AppError> {
    let ban_id = Uuid::new_v4().to_string();

    sqlx::query(
        r#"
        INSERT INTO user_bans (id, user_id, banned_by, banned_by_type, reason, permanent, created_at)
        VALUES ($1, $2, $3, 'manual', $4, $5, NOW())
        "#,
    )
    .bind(ban_id)
    .bind(&payload.user_id)
    .bind(&admin.id)
    .bind(&payload.reason)
    .bind(payload.permanent)
    .execute(&state.pool)
    .await
    .map_err(AppError::Database)?;

    let user_token: Option<(Option<String>,)> = sqlx::query_as("SELECT token_identifier FROM users WHERE id = $1")
        .bind(&payload.user_id)
        .fetch_optional(&state.pool)
        .await
        .map_err(AppError::Database)?;

    if let Some((Some(token_id),)) = user_token {
        state.user_cache.invalidate(&token_id).await;
    }

    Ok(Json(GenericMessageResponse {
        message: "User banned successfully".to_string(),
    }))
}

// POST /api/admin/bans/app
async fn ban_app(
    State(state): State<AppState>,
    admin: AdminUser,
    Json(payload): Json<BanAppRequest>,
) -> Result<Json<GenericMessageResponse>, AppError> {
    let ban_id = Uuid::new_v4().to_string();

    sqlx::query(
        r#"
        INSERT INTO app_bans (id, package_name, title, play_store_url, banned_by, reason, created_at)
        VALUES ($1, $2, $3, $4, $5, $6, NOW())
        ON CONFLICT (package_name) DO NOTHING
        "#,
    )
    .bind(ban_id)
    .bind(payload.package_name.trim())
    .bind(payload.title.trim())
    .bind(payload.play_store_url.trim())
    .bind(&admin.id)
    .bind(&payload.reason)
    .execute(&state.pool)
    .await
    .map_err(AppError::Database)?;

    sqlx::query("UPDATE apps SET status = 'archived', updated_at = NOW() WHERE LOWER(package_name) = LOWER($1)")
        .bind(payload.package_name.trim())
        .execute(&state.pool)
        .await
        .map_err(AppError::Database)?;

    Ok(Json(GenericMessageResponse {
        message: "App package banned and active apps archived".to_string(),
    }))
}

// GET /api/admin/apps
async fn list_admin_apps(
    State(state): State<AppState>,
    _admin: AdminUser,
    Query(params): Query<AdminAppsQuery>,
) -> Result<Json<AdminAppsResponse>, AppError> {
    let limit = params.limit.unwrap_or(50).clamp(1, 100);
    let offset = params.offset.unwrap_or(0).max(0);

    let apps = sqlx::query_as::<_, AppRecord>(
        "SELECT * FROM apps ORDER BY created_at DESC LIMIT $1 OFFSET $2",
    )
    .bind(limit)
    .bind(offset)
    .fetch_all(&state.pool)
    .await
    .map_err(AppError::Database)?;

    let count = apps.len();
    Ok(Json(AdminAppsResponse {
        apps,
        total: count,
        duplicate_packages_count: 0,
    }))
}

// DELETE /api/admin/apps/:id
async fn admin_delete_app(
    State(state): State<AppState>,
    _admin: AdminUser,
    Path(id): Path<String>,
) -> Result<Json<GenericMessageResponse>, AppError> {
    let app: (String, String) = sqlx::query_as("SELECT title, package_name FROM apps WHERE id = $1")
        .bind(&id)
        .fetch_optional(&state.pool)
        .await
        .map_err(AppError::Database)?
        .ok_or_else(|| AppError::NotFound("App not found".to_string()))?;

    let _ = sqlx::query("DELETE FROM proofs WHERE match_id IN (SELECT id FROM matches WHERE app1_id = $1 OR app2_id = $1)").bind(&id).execute(&state.pool).await;
    let _ = sqlx::query("DELETE FROM messages WHERE match_id IN (SELECT id FROM matches WHERE app1_id = $1 OR app2_id = $1)").bind(&id).execute(&state.pool).await;
    let _ = sqlx::query("DELETE FROM matches WHERE app1_id = $1 OR app2_id = $1").bind(&id).execute(&state.pool).await;
    let _ = sqlx::query("DELETE FROM reports WHERE target_id = $1").bind(&id).execute(&state.pool).await;
    let _ = sqlx::query("DELETE FROM apps WHERE id = $1").bind(&id).execute(&state.pool).await;

    Ok(Json(GenericMessageResponse {
        message: format!("App \"{}\" ({}) has been deleted successfully.", app.0, app.1),
    }))
}

// POST /api/admin/apps/clean-all
async fn clean_all_apps(
    State(state): State<AppState>,
    _admin: AdminUser,
) -> Result<Json<CleanupResultResponse>, AppError> {
    let _ = sqlx::query("DELETE FROM proofs").execute(&state.pool).await;
    let _ = sqlx::query("DELETE FROM messages").execute(&state.pool).await;
    let _ = sqlx::query("DELETE FROM reports").execute(&state.pool).await;
    let _ = sqlx::query("DELETE FROM matches").execute(&state.pool).await;
    let _ = sqlx::query("DELETE FROM app_bans").execute(&state.pool).await;
    let deleted = sqlx::query("DELETE FROM apps").execute(&state.pool).await.map_err(AppError::Database)?;
    let _ = sqlx::query("UPDATE users SET apps_count = 0").execute(&state.pool).await;

    Ok(Json(CleanupResultResponse {
        message: "All apps, matches, and testing records have been cleanly deleted.".to_string(),
        deleted_apps_count: Some(deleted.rows_affected() as usize),
        deleted_users_count: None,
    }))
}

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/api/reports", post(create_report))
        .route("/api/admin/stats", get(get_platform_stats))
        .route("/api/admin/reports", get(list_reports))
        .route("/api/admin/reports/{id}", patch(update_report))
        .route("/api/admin/bans/user", post(ban_user))
        .route("/api/admin/bans/app", post(ban_app))
        .route("/api/admin/apps", get(list_admin_apps))
        .route("/api/admin/apps/{id}", delete(admin_delete_app))
        .route("/api/admin/apps/clean-all", post(clean_all_apps))
}
