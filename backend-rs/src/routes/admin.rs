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

#[derive(Deserialize)]
pub struct DeleteAppQuery {
    #[serde(rename = "banPackage")]
    pub ban_package: Option<String>,
    pub reason: Option<String>,
}

#[derive(Serialize)]
pub struct AdminUserListItem {
    pub id: String,
    #[serde(rename = "tokenIdentifier")]
    pub token_identifier: Option<String>,
    pub name: String,
    pub email: String,
    #[serde(rename = "avatarUrl")]
    pub avatar_url: Option<String>,
    pub reputation: i32,
    #[serde(rename = "appsCount")]
    pub apps_count: i32,
    #[serde(rename = "isAdmin")]
    pub is_admin: bool,
    #[serde(rename = "isGroupMember")]
    pub is_group_member: bool,
    pub streak: i32,
    #[serde(rename = "bestStreak")]
    pub best_streak: i32,
    #[serde(rename = "createdAt")]
    pub created_at: String,
}

#[derive(Serialize)]
pub struct AdminUserDetailsUser {
    pub id: String,
    pub name: Option<String>,
    pub email: Option<String>,
    #[serde(rename = "avatarUrl")]
    pub avatar_url: Option<String>,
    pub reputation: i32,
    pub streak: i32,
    #[serde(rename = "isGroupMember")]
    pub is_group_member: bool,
    #[serde(rename = "createdAt")]
    pub created_at: String,
}

#[derive(Serialize)]
pub struct AdminUserDetailsApp {
    pub id: String,
    pub title: String,
    #[serde(rename = "packageName")]
    pub package_name: String,
    #[serde(rename = "iconUrl")]
    pub icon_url: String,
    #[serde(rename = "playStoreUrl")]
    pub play_store_url: String,
    pub status: String,
    #[serde(rename = "requiredTesters")]
    pub required_testers: i32,
    #[serde(rename = "currentTesters")]
    pub current_testers: i32,
    pub instructions: String,
    #[serde(rename = "createdAt")]
    pub created_at: String,
}

#[derive(Serialize)]
pub struct AdminUserDetailsResponse {
    pub user: AdminUserDetailsUser,
    pub apps: Vec<AdminUserDetailsApp>,
    #[serde(rename = "activeMatchesCount")]
    pub active_matches_count: i64,
}

#[derive(Serialize)]
pub struct CleanDuplicatesResponse {
    pub message: String,
    #[serde(rename = "deletedAppsCount")]
    pub deleted_apps_count: usize,
    #[serde(rename = "cleanedPackages")]
    pub cleaned_packages: Vec<String>,
}

#[derive(Serialize)]
pub struct CleanTestUsersResponse {
    pub message: String,
    #[serde(rename = "deletedUsersCount")]
    pub deleted_users_count: usize,
}

// GET /api/admin/users
async fn list_admin_users(
    State(state): State<AppState>,
    _admin: AdminUser,
    Query(query): Query<AdminUsersQuery>,
) -> Result<Json<Vec<AdminUserListItem>>, AppError> {
    let limit = query.limit.unwrap_or(50).clamp(1, 100);

    let users = if let Some(search) = query.search.filter(|s| !s.trim().is_empty()) {
        let pattern = format!("%{}%", search.trim());
        sqlx::query_as::<_, (String, Option<String>, String, String, Option<String>, i32, i32, bool, bool, i32, i32, OffsetDateTime)>(
            r#"
            SELECT id, token_identifier, name, email, avatar_url, reputation, apps_count,
                   is_admin, is_group_member, streak, best_streak, created_at
            FROM users
            WHERE name ILIKE $1 OR email ILIKE $1 OR token_identifier ILIKE $1
            ORDER BY created_at DESC
            LIMIT $2
            "#,
        )
        .bind(pattern)
        .bind(limit)
        .fetch_all(&state.pool)
        .await
        .map_err(AppError::Database)?
    } else {
        sqlx::query_as::<_, (String, Option<String>, String, String, Option<String>, i32, i32, bool, bool, i32, i32, OffsetDateTime)>(
            r#"
            SELECT id, token_identifier, name, email, avatar_url, reputation, apps_count,
                   is_admin, is_group_member, streak, best_streak, created_at
            FROM users
            ORDER BY created_at DESC
            LIMIT $1
            "#,
        )
        .bind(limit)
        .fetch_all(&state.pool)
        .await
        .map_err(AppError::Database)?
    };

    let result = users
        .into_iter()
        .map(|u| AdminUserListItem {
            id: u.0,
            token_identifier: u.1,
            name: u.2,
            email: u.3,
            avatar_url: u.4,
            reputation: u.5,
            apps_count: u.6,
            is_admin: u.7,
            is_group_member: u.8,
            streak: u.9,
            best_streak: u.10,
            created_at: u.11.format(&Rfc3339).unwrap_or_default(),
        })
        .collect();

    Ok(Json(result))
}

// GET /api/admin/users/:userId/details
async fn get_admin_user_details(
    State(state): State<AppState>,
    _admin: AdminUser,
    Path(target_user_id): Path<String>,
) -> Result<Json<AdminUserDetailsResponse>, AppError> {
    let user_row = sqlx::query_as::<_, (String, String, String, Option<String>, i32, i32, bool, OffsetDateTime)>(
        r#"
        SELECT id, name, email, avatar_url, reputation, streak, is_group_member, created_at
        FROM users
        WHERE id = $1 OR token_identifier = $1
        "#,
    )
    .bind(&target_user_id)
    .fetch_optional(&state.pool)
    .await
    .map_err(AppError::Database)?
    .ok_or_else(|| AppError::NotFound("User not found".to_string()))?;

    let uid = &user_row.0;

    let apps_rows = sqlx::query_as::<_, (String, String, String, String, String, String, i32, String, OffsetDateTime)>(
        r#"
        SELECT id, title, package_name, icon_url, play_store_url, status, required_testers, instructions, created_at
        FROM apps
        WHERE user_id = $1 AND status != 'archived'
        ORDER BY created_at DESC
        "#,
    )
    .bind(uid)
    .fetch_all(&state.pool)
    .await
    .map_err(AppError::Database)?;

    let mut user_apps = Vec::with_capacity(apps_rows.len());
    for row in apps_rows {
        let (current_testers,): (i64,) = sqlx::query_as(
            "SELECT COUNT(*)::bigint FROM matches WHERE (app1_id = $1 OR app2_id = $1) AND status != 'rejected'",
        )
        .bind(&row.0)
        .fetch_one(&state.pool)
        .await
        .unwrap_or((0,));

        user_apps.push(AdminUserDetailsApp {
            id: row.0,
            title: row.1,
            package_name: row.2,
            icon_url: row.3,
            play_store_url: row.4,
            status: row.5,
            required_testers: row.6,
            current_testers: current_testers as i32,
            instructions: row.7,
            created_at: row.8.format(&Rfc3339).unwrap_or_default(),
        });
    }

    let (active_matches_count,): (i64,) = sqlx::query_as(
        "SELECT COUNT(*)::bigint FROM matches WHERE status = 'active' AND (user1_id = $1 OR user2_id = $1)",
    )
    .bind(uid)
    .fetch_one(&state.pool)
    .await
    .unwrap_or((0,));

    Ok(Json(AdminUserDetailsResponse {
        user: AdminUserDetailsUser {
            id: user_row.0,
            name: Some(user_row.1),
            email: Some(user_row.2),
            avatar_url: user_row.3,
            reputation: user_row.4,
            streak: user_row.5,
            is_group_member: user_row.6,
            created_at: user_row.7.format(&Rfc3339).unwrap_or_default(),
        },
        apps: user_apps,
        active_matches_count,
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

    let duplicate_rows = sqlx::query_as::<_, (String, i64)>(
        "SELECT LOWER(TRIM(package_name)), COUNT(*) FROM apps WHERE status != 'archived' GROUP BY LOWER(TRIM(package_name)) HAVING COUNT(*) > 1",
    )
    .fetch_all(&state.pool)
    .await
    .unwrap_or_default();

    let count = apps.len();
    Ok(Json(AdminAppsResponse {
        apps,
        total: count,
        duplicate_packages_count: duplicate_rows.len(),
    }))
}

// DELETE /api/admin/apps/:id
async fn admin_delete_app(
    State(state): State<AppState>,
    admin: AdminUser,
    Path(id): Path<String>,
    Query(query): Query<DeleteAppQuery>,
) -> Result<Json<GenericMessageResponse>, AppError> {
    let app: (String, String, String) = sqlx::query_as("SELECT title, package_name, user_id FROM apps WHERE id = $1")
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

    // Decrement user's apps_count
    let _ = sqlx::query("UPDATE users SET apps_count = GREATEST(0, apps_count - 1), updated_at = NOW() WHERE id = $1")
        .bind(&app.2)
        .execute(&state.pool)
        .await;

    // Optionally ban the package
    if query.ban_package.as_deref() == Some("true") {
        let ban_id = Uuid::new_v4().to_string();
        let reason = query.reason.unwrap_or_else(|| "Banned by Admin".to_string());
        let _ = sqlx::query(
            r#"
            INSERT INTO app_bans (id, package_name, title, play_store_url, banned_by, reason, created_at)
            VALUES ($1, $2, $3, '', $4, $5, NOW())
            ON CONFLICT (package_name) DO NOTHING
            "#,
        )
        .bind(ban_id)
        .bind(app.1.trim())
        .bind(&app.0)
        .bind(&admin.id)
        .bind(reason)
        .execute(&state.pool)
        .await;
    }

    Ok(Json(GenericMessageResponse {
        message: format!("App \"{}\" ({}) has been deleted successfully.", app.0, app.1),
    }))
}

// POST /api/admin/apps/clean-duplicates
async fn clean_duplicate_apps(
    State(state): State<AppState>,
    _admin: AdminUser,
) -> Result<Json<CleanDuplicatesResponse>, AppError> {
    let all_apps = sqlx::query_as::<_, (String, String)>(
        "SELECT id, package_name FROM apps WHERE status != 'archived' ORDER BY created_at ASC",
    )
    .fetch_all(&state.pool)
    .await
    .map_err(AppError::Database)?;

    let mut seen_packages = std::collections::HashSet::new();
    let mut duplicate_app_ids = Vec::new();
    let mut cleaned_packages = std::collections::HashSet::new();

    for (id, pkg) in all_apps {
        let pkg_clean = pkg.trim().to_lowercase();
        if seen_packages.contains(&pkg_clean) {
            duplicate_app_ids.push(id);
            cleaned_packages.insert(pkg);
        } else {
            seen_packages.insert(pkg_clean);
        }
    }

    if duplicate_app_ids.is_empty() {
        return Ok(Json(CleanDuplicatesResponse {
            message: "No duplicate apps found in the system.".to_string(),
            deleted_apps_count: 0,
            cleaned_packages: Vec::new(),
        }));
    }

    for app_id in &duplicate_app_ids {
        let _ = sqlx::query("DELETE FROM proofs WHERE match_id IN (SELECT id FROM matches WHERE app1_id = $1 OR app2_id = $1)").bind(app_id).execute(&state.pool).await;
        let _ = sqlx::query("DELETE FROM messages WHERE match_id IN (SELECT id FROM matches WHERE app1_id = $1 OR app2_id = $1)").bind(app_id).execute(&state.pool).await;
        let _ = sqlx::query("DELETE FROM matches WHERE app1_id = $1 OR app2_id = $1").bind(app_id).execute(&state.pool).await;
        let _ = sqlx::query("DELETE FROM reports WHERE target_id = $1").bind(app_id).execute(&state.pool).await;
        let _ = sqlx::query("DELETE FROM apps WHERE id = $1").bind(app_id).execute(&state.pool).await;
    }

    let count = duplicate_app_ids.len();
    Ok(Json(CleanDuplicatesResponse {
        message: format!("Successfully cleaned {} duplicate app(s).", count),
        deleted_apps_count: count,
        cleaned_packages: cleaned_packages.into_iter().collect(),
    }))
}

// POST /api/admin/users/clean-test-users
async fn clean_test_users(
    State(state): State<AppState>,
    admin: AdminUser,
) -> Result<Json<CleanTestUsersResponse>, AppError> {
    const ADMIN_EMAILS: &[&str] = &[
        "neerajlovecyber@gmail.com",
        "futureaistudio41@gmail.com",
        "theneerajsec@gmail.com",
    ];

    let all_users = sqlx::query_as::<_, (String, Option<String>, String, String, bool)>(
        "SELECT id, token_identifier, name, email, is_admin FROM users",
    )
    .fetch_all(&state.pool)
    .await
    .map_err(AppError::Database)?;

    let mut test_user_ids = Vec::new();

    for (id, token_id, name, email, is_admin) in all_users {
        if id == admin.id || is_admin {
            continue;
        }

        let email_lower = email.to_lowercase();
        let token_lower = token_id.as_deref().unwrap_or("").to_lowercase();
        let name_lower = name.to_lowercase();

        if ADMIN_EMAILS.iter().any(|ae| email_lower.contains(ae)) {
            continue;
        }

        let is_test = email_lower.contains("test")
            || email_lower.contains("stress")
            || email_lower.contains("dummy")
            || email_lower.contains("example.com")
            || token_lower.contains("test")
            || token_lower.contains("stress")
            || name_lower.contains("test user")
            || name_lower.contains("tester #");

        if is_test {
            test_user_ids.push(id);
        }
    }

    let count = test_user_ids.len();
    if count == 0 {
        return Ok(Json(CleanTestUsersResponse {
            message: "No test users found to delete.".to_string(),
            deleted_users_count: 0,
        }));
    }

    for uid in &test_user_ids {
        let _ = sqlx::query("DELETE FROM proofs WHERE uploader_id = $1").bind(uid).execute(&state.pool).await;
        let _ = sqlx::query("DELETE FROM messages WHERE sender_id = $1").bind(uid).execute(&state.pool).await;
        let _ = sqlx::query("DELETE FROM reports WHERE reporter_id = $1 OR target_id = $1").bind(uid).execute(&state.pool).await;
        let _ = sqlx::query("DELETE FROM matches WHERE user1_id = $1 OR user2_id = $1").bind(uid).execute(&state.pool).await;
        let _ = sqlx::query("DELETE FROM apps WHERE user_id = $1").bind(uid).execute(&state.pool).await;
        let _ = sqlx::query("DELETE FROM admin_messages WHERE sender_id = $1").bind(uid).execute(&state.pool).await;
        let _ = sqlx::query("DELETE FROM admin_chats WHERE user_id = $1").bind(uid).execute(&state.pool).await;
        let _ = sqlx::query("DELETE FROM user_bans WHERE user_id = $1").bind(uid).execute(&state.pool).await;
        let _ = sqlx::query("DELETE FROM users WHERE id = $1").bind(uid).execute(&state.pool).await;
    }

    Ok(Json(CleanTestUsersResponse {
        message: format!("Successfully deleted {} dummy test users.", count),
        deleted_users_count: count,
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
        .route("/api/admin/apps/clean-duplicates", post(clean_duplicate_apps))
        .route("/api/admin/apps/clean-all", post(clean_all_apps))
        .route("/api/admin/users", get(list_admin_users))
        .route("/api/admin/users/{userId}/details", get(get_admin_user_details))
        .route("/api/admin/users/clean-test-users", post(clean_test_users))
}
