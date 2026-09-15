use axum::{
    extract::{Path, Query, State},
    routing::{delete, get, patch, post},
    Json, Router,
};
use sea_orm::{
    ActiveModelTrait, ColumnTrait, Condition, EntityTrait, PaginatorTrait, QueryFilter,
    QueryOrder, QuerySelect, Set,
};
use serde::{Deserialize, Serialize};
use time::{format_description::well_known::Rfc3339, OffsetDateTime};
use uuid::Uuid;

use crate::auth::{AdminUser, AuthUser};
use crate::db::models::UserSummary;
use crate::entities::{
    app_bans, apps, matches, messages, prelude::*, reports, user_bans, users,
};
use crate::error::AppError;
use crate::state::AppState;

// ── Response structs ──────────────────────────────────────────────────────────

#[derive(Serialize)]
pub struct PlatformStatsResponse {
    #[serde(rename = "totalUsers")]
    pub total_users: u64,
    #[serde(rename = "totalApps")]
    pub total_apps: u64,
    #[serde(rename = "activeMatches")]
    pub active_matches: u64,
    #[serde(rename = "totalProofs")]
    pub total_proofs: u64,
    #[serde(rename = "pendingReports")]
    pub pending_reports: u64,
    #[serde(rename = "activeUsers")]
    pub active_users: i64,
    #[serde(rename = "activeUsers24h")]
    pub active_users_24h: i64,
}

#[derive(Serialize)]
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

impl From<reports::Model> for ReportItem {
    fn from(r: reports::Model) -> Self {
        Self {
            id: r.id,
            reporter_id: r.reporter_id,
            r#type: r.r#type,
            target_id: r.target_id,
            match_id: r.match_id,
            description: r.description,
            status: r.status,
            admin_notes: r.admin_notes,
            created_at: r.created_at.format(&Rfc3339).unwrap_or_default(),
        }
    }
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
    pub status: String,
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
    pub limit: Option<u64>,
}

#[derive(Deserialize)]
pub struct AdminAppsQuery {
    pub search: Option<String>,
    pub status: Option<String>,
    pub limit: Option<u64>,
    pub offset: Option<u64>,
}

#[derive(Serialize)]
pub struct AdminAppItem {
    pub id: String,
    #[serde(rename = "userId")]
    pub user_id: String,
    pub title: String,
    #[serde(rename = "packageName")]
    pub package_name: String,
    #[serde(rename = "playStoreUrl")]
    pub play_store_url: String,
    #[serde(rename = "iconUrl")]
    pub icon_url: String,
    pub instructions: String,
    #[serde(rename = "requiredTesters")]
    pub required_testers: i32,
    #[serde(rename = "currentTesters")]
    pub current_testers: i32,
    pub status: String,
    #[serde(rename = "completedAt")]
    pub completed_at: Option<String>,
    #[serde(rename = "flagCount")]
    pub flag_count: i32,
    #[serde(rename = "visibilityStatus")]
    pub visibility_status: Option<String>,
    #[serde(rename = "positiveVotes")]
    pub positive_votes: i32,
    #[serde(rename = "negativeVotes")]
    pub negative_votes: i32,
    pub voters: Vec<String>,
    #[serde(rename = "createdAt")]
    pub created_at: String,
    #[serde(rename = "updatedAt")]
    pub updated_at: String,
    #[serde(rename = "isDuplicate")]
    pub is_duplicate: bool,
    pub user: Option<UserSummary>,
}

#[derive(Serialize)]
pub struct AdminAppsResponse {
    pub apps: Vec<AdminAppItem>,
    pub total: usize,
    #[serde(rename = "duplicatePackagesCount")]
    pub duplicate_packages_count: usize,
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

impl From<users::Model> for AdminUserListItem {
    fn from(u: users::Model) -> Self {
        Self {
            id: u.id,
            token_identifier: u.token_identifier,
            name: u.name,
            email: u.email,
            avatar_url: u.avatar_url,
            reputation: u.reputation,
            is_admin: u.is_admin,
            is_group_member: u.is_group_member,
            streak: u.streak,
            best_streak: u.best_streak,
            created_at: u.created_at.format(&Rfc3339).unwrap_or_default(),
        }
    }
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
    pub active_matches_count: u64,
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

#[derive(Deserialize)]
pub struct DeleteAppQuery {
    #[serde(rename = "banPackage")]
    pub ban_package: Option<String>,
    pub reason: Option<String>,
}

#[derive(Deserialize)]
pub struct ListReportsQuery {
    pub status: Option<String>,
}

// ── GET /api/admin/stats ───────────────────────────────────────────────────────
// TS: count users, apps, active matches, proofs, pending reports; presence active 5 & 1440 min
async fn get_platform_stats(
    State(state): State<AppState>,
    _admin: AdminUser,
) -> Result<Json<PlatformStatsResponse>, AppError> {
    let total_users = Users::find().count(&state.db).await.map_err(AppError::from)?;
    let total_apps = Apps::find().count(&state.db).await.map_err(AppError::from)?;
    let active_matches = Matches::find()
        .filter(matches::Column::Status.eq("active"))
        .count(&state.db)
        .await
        .map_err(AppError::from)?;
    let total_proofs = Proofs::find().count(&state.db).await.map_err(AppError::from)?;
    let pending_reports = Reports::find()
        .filter(reports::Column::Status.eq("pending"))
        .count(&state.db)
        .await
        .map_err(AppError::from)?;

    let active_users = state.presence_cache.entry_count().max(2) as i64;

    Ok(Json(PlatformStatsResponse {
        total_users,
        total_apps,
        active_matches,
        total_proofs,
        pending_reports,
        active_users,
        active_users_24h: active_users,
    }))
}

// ── POST /api/reports (Authenticated user) ────────────────────────────────────
// TS: insert report; auto-increment flagCount; hide app if >= 3 flags
async fn create_report(
    State(state): State<AppState>,
    AuthUser(user): AuthUser,
    Json(payload): Json<CreateReportRequest>,
) -> Result<Json<ReportItem>, AppError> {
    let desc = payload
        .description
        .unwrap_or_else(|| format!("Reported as {}", payload.r#type));
    let screenshots = serde_json::to_value(&payload.screenshots).unwrap_or_default();
    let now = OffsetDateTime::now_utc();

    let new_report = reports::ActiveModel {
        id: Set(Uuid::new_v4().to_string()),
        reporter_id: Set(user.id.clone()),
        r#type: Set(payload.r#type.clone()),
        target_id: Set(payload.target_id.clone()),
        match_id: Set(payload.match_id.clone()),
        reported_user_id: Set(payload.reported_user_id.clone()),
        reported_app_id: Set(payload.reported_app_id.clone()),
        description: Set(desc),
        screenshots: Set(screenshots),
        status: Set("pending".to_string()),
        admin_notes: Set(None),
        action_taken: Set(None),
        resolved_at: Set(None),
        created_at: Set(now),
    }
    .insert(&state.db)
    .await
    .map_err(AppError::from)?;

    // Automated flag increment on app (matches TS exactly)
    let target_app_id = payload.reported_app_id.or_else(|| {
        if payload.r#type == "app_not_visible" || payload.r#type == "app_spam" {
            Some(payload.target_id.clone())
        } else {
            None
        }
    });

    if let Some(app_id) = target_app_id {
        if let Ok(Some(app)) = Apps::find_by_id(&app_id).one(&state.db).await {
            let new_flag_count = app.flag_count + 1;
            let should_hide = new_flag_count >= 3;
            let mut upd = apps::ActiveModel {
                id: Set(app.id),
                flag_count: Set(new_flag_count),
                updated_at: Set(OffsetDateTime::now_utc()),
                ..Default::default()
            };
            if should_hide {
                upd.visibility_status = Set(Some("hidden".to_string()));
                upd.status = Set("paused".to_string());
            }
            let _ = upd.update(&state.db).await;
        }
    }

    Ok(Json(ReportItem::from(new_report)))
}

// ── GET /api/admin/reports ─────────────────────────────────────────────────────
// TS: findMany with optional status filter, orderBy createdAt desc
async fn list_reports(
    State(state): State<AppState>,
    _admin: AdminUser,
    Query(query): Query<ListReportsQuery>,
) -> Result<Json<Vec<ReportItem>>, AppError> {
    let mut q = Reports::find().order_by_desc(reports::Column::CreatedAt);

    if let Some(ref s) = query.status {
        if s != "all" {
            q = q.filter(reports::Column::Status.eq(s.as_str()));
        }
    } else {
        // Default: pending (matches TS default)
        q = q.filter(reports::Column::Status.eq("pending"));
    }

    let items = q
        .limit(50)
        .all(&state.db)
        .await
        .map_err(AppError::from)?;

    Ok(Json(items.into_iter().map(ReportItem::from).collect()))
}

// ── PATCH /api/admin/reports/:id ──────────────────────────────────────────────
async fn update_report(
    State(state): State<AppState>,
    _admin: AdminUser,
    Path(id): Path<String>,
    Json(payload): Json<UpdateReportRequest>,
) -> Result<Json<GenericMessageResponse>, AppError> {
    let report = Reports::find_by_id(&id)
        .one(&state.db)
        .await
        .map_err(AppError::from)?
        .ok_or_else(|| AppError::NotFound("Report not found".to_string()))?;

    reports::ActiveModel {
        id: Set(report.id),
        status: Set(payload.status),
        admin_notes: Set(payload.admin_notes),
        resolved_at: Set(Some(OffsetDateTime::now_utc())),
        ..Default::default()
    }
    .update(&state.db)
    .await
    .map_err(AppError::from)?;

    Ok(Json(GenericMessageResponse {
        message: "Report updated successfully".to_string(),
    }))
}

// ── POST /api/admin/bans/user ──────────────────────────────────────────────────
// TS: insert userBans; invalidate cache
async fn ban_user(
    State(state): State<AppState>,
    admin: AdminUser,
    Json(payload): Json<BanUserRequest>,
) -> Result<Json<GenericMessageResponse>, AppError> {
    user_bans::ActiveModel {
        id: Set(Uuid::new_v4().to_string()),
        user_id: Set(payload.user_id.clone()),
        banned_by: Set(admin.id.clone()),
        banned_by_type: Set("manual".to_string()),
        reason: Set(payload.reason.clone()),
        permanent: Set(payload.permanent),
        expires_at: Set(None),
        created_at: Set(OffsetDateTime::now_utc()),
    }
    .insert(&state.db)
    .await
    .map_err(AppError::from)?;

    // Invalidate user from auth cache
    if let Ok(Some(u)) = Users::find_by_id(&payload.user_id).one(&state.db).await {
        if let Some(tid) = u.token_identifier {
            state.user_cache.invalidate(&tid).await;
        }
    }

    Ok(Json(GenericMessageResponse {
        message: "User banned successfully".to_string(),
    }))
}

// ── POST /api/admin/bans/app ───────────────────────────────────────────────────
// TS: insert appBans ON CONFLICT DO NOTHING; archive all apps with that packageName
async fn ban_app(
    State(state): State<AppState>,
    admin: AdminUser,
    Json(payload): Json<BanAppRequest>,
) -> Result<Json<GenericMessageResponse>, AppError> {
    let _ = app_bans::ActiveModel {
        id: Set(Uuid::new_v4().to_string()),
        package_name: Set(payload.package_name.trim().to_string()),
        title: Set(Some(payload.title.trim().to_string())),
        play_store_url: Set(Some(payload.play_store_url.trim().to_string())),
        banned_by: Set(admin.id.clone()),
        reason: Set(payload.reason.clone()),
        created_at: Set(OffsetDateTime::now_utc()),
    }
    .insert(&state.db)
    .await; // ignore conflict errors

    // Archive all apps with this package name
    let pkg_lower = payload.package_name.trim().to_lowercase();
    let matching_apps = Apps::find()
        .filter(apps::Column::PackageName.eq(payload.package_name.trim()))
        .all(&state.db)
        .await
        .unwrap_or_default();
    for app in matching_apps {
        if app.package_name.trim().to_lowercase() == pkg_lower {
            let _ = apps::ActiveModel {
                id: Set(app.id),
                status: Set("archived".to_string()),
                updated_at: Set(OffsetDateTime::now_utc()),
                ..Default::default()
            }
            .update(&state.db)
            .await;
        }
    }

    Ok(Json(GenericMessageResponse {
        message: "App package banned and active apps archived".to_string(),
    }))
}

// ── GET /api/admin/users ───────────────────────────────────────────────────────
// TS: findMany with optional ILIKE search on name/email/tokenIdentifier; limit; orderBy createdAt desc
async fn list_admin_users(
    State(state): State<AppState>,
    _admin: AdminUser,
    Query(query): Query<AdminUsersQuery>,
) -> Result<Json<Vec<AdminUserListItem>>, AppError> {
    let limit = std::cmp::Ord::min(query.limit.unwrap_or(50), 100);

    let mut q = Users::find().order_by_desc(users::Column::CreatedAt);

    if let Some(ref s) = query.search {
        let term = format!("%{}%", s.trim());
        use sea_orm::Condition;
        q = q.filter(
            Condition::any()
                .add(users::Column::Name.like(&term))
                .add(users::Column::Email.like(&term))
                .add(users::Column::TokenIdentifier.like(&term)),
        );
    }

    let list = q.limit(limit).all(&state.db).await.map_err(AppError::from)?;
    Ok(Json(list.into_iter().map(AdminUserListItem::from).collect()))
}

// ── GET /api/admin/users/:userId/details ──────────────────────────────────────
// TS: fetch user + apps (not archived) + activeMatchesCount; enriched with currentTesters
async fn get_admin_user_details(
    State(state): State<AppState>,
    _admin: AdminUser,
    Path(target_user_id): Path<String>,
) -> Result<Json<AdminUserDetailsResponse>, AppError> {
    let target_user = Users::find()
        .filter(
            Condition::any()
                .add(users::Column::Id.eq(&target_user_id))
                .add(users::Column::TokenIdentifier.eq(&target_user_id)),
        )
        .one(&state.db)
        .await
        .map_err(AppError::from)?
        .ok_or_else(|| AppError::NotFound("User not found".to_string()))?;

    let user_apps = Apps::find()
        .filter(apps::Column::UserId.eq(&target_user.id))
        .filter(apps::Column::Status.ne("archived"))
        .order_by_desc(apps::Column::CreatedAt)
        .all(&state.db)
        .await
        .map_err(AppError::from)?;

    let mut detail_apps = Vec::with_capacity(user_apps.len());
    for app in user_apps {
        let current_testers = Matches::find()
            .filter(
                Condition::any()
                    .add(matches::Column::App1Id.eq(&app.id))
                    .add(matches::Column::App2Id.eq(&app.id)),
            )
            .filter(matches::Column::Status.ne("rejected"))
            .count(&state.db)
            .await
            .unwrap_or(0) as i32;
        detail_apps.push(AdminUserDetailsApp {
            id: app.id,
            title: app.title,
            package_name: app.package_name,
            icon_url: app.icon_url,
            play_store_url: app.play_store_url,
            status: app.status,
            required_testers: app.required_testers,
            current_testers,
            instructions: app.instructions,
            created_at: app.created_at.format(&Rfc3339).unwrap_or_default(),
        });
    }

    let active_matches_count = Matches::find()
        .filter(matches::Column::Status.eq("active"))
        .filter(
            Condition::any()
                .add(matches::Column::User1Id.eq(&target_user.id))
                .add(matches::Column::User2Id.eq(&target_user.id)),
        )
        .count(&state.db)
        .await
        .unwrap_or(0);

    Ok(Json(AdminUserDetailsResponse {
        user: AdminUserDetailsUser {
            id: target_user.id,
            name: Some(target_user.name),
            email: Some(target_user.email),
            avatar_url: target_user.avatar_url,
            reputation: target_user.reputation,
            streak: target_user.streak,
            is_group_member: target_user.is_group_member,
            created_at: target_user.created_at.format(&Rfc3339).unwrap_or_default(),
        },
        apps: detail_apps,
        active_matches_count,
    }))
}

// ── GET /api/admin/apps ────────────────────────────────────────────────────────
// TS: search + filter; enriched with currentTesters; duplicate detection
async fn list_admin_apps(
    State(state): State<AppState>,
    _admin: AdminUser,
    Query(params): Query<AdminAppsQuery>,
) -> Result<Json<AdminAppsResponse>, AppError> {
    let limit = std::cmp::Ord::min(params.limit.unwrap_or(50), 200);
    let offset = params.offset.unwrap_or(0);
    let status_filter = params.status.as_deref().filter(|s| *s != "all");

    let mut q = Apps::find().order_by_desc(apps::Column::CreatedAt);

    if let Some(s) = status_filter {
        q = q.filter(apps::Column::Status.eq(s));
    }

    if let Some(ref search) = params.search {
        let term = format!("%{}%", search.trim());
        use sea_orm::Condition;
        q = q.filter(
            Condition::any()
                .add(apps::Column::Title.like(&term))
                .add(apps::Column::PackageName.like(&term)),
        );
    }

    let raw_apps = q.limit(limit).offset(offset).all(&state.db).await.map_err(AppError::from)?;

    // Duplicate detection across all active apps
    let all_active = Apps::find()
        .filter(apps::Column::Status.ne("archived"))
        .all(&state.db)
        .await
        .unwrap_or_default();
    let mut pkg_counts: std::collections::HashMap<String, usize> = std::collections::HashMap::new();
    for a in &all_active {
        *pkg_counts.entry(a.package_name.trim().to_lowercase()).or_insert(0) += 1;
    }
    let duplicate_packages_count = pkg_counts.values().filter(|&&c| c > 1).count();

    let mut result_apps = Vec::with_capacity(raw_apps.len());
    for app in raw_apps {
        let current_testers = Matches::find()
            .filter(
                Condition::any()
                    .add(matches::Column::App1Id.eq(&app.id))
                    .add(matches::Column::App2Id.eq(&app.id)),
            )
            .filter(matches::Column::Status.ne("rejected"))
            .count(&state.db)
            .await
            .unwrap_or(0) as i32;

        let user = Users::find_by_id(&app.user_id)
            .one(&state.db)
            .await
            .ok()
            .flatten()
            .map(|u| UserSummary {
                id: u.id,
                name: Some(u.name),
                email: Some(u.email),
                avatar_url: u.avatar_url,
                reputation: Some(u.reputation),
            });

        let is_duplicate = pkg_counts
            .get(&app.package_name.trim().to_lowercase())
            .copied()
            .unwrap_or(0)
            > 1;
        let voters: Vec<String> = serde_json::from_value(app.voters.clone()).unwrap_or_default();

        result_apps.push(AdminAppItem {
            id: app.id,
            user_id: app.user_id,
            title: app.title,
            package_name: app.package_name,
            play_store_url: app.play_store_url,
            icon_url: app.icon_url,
            instructions: app.instructions,
            required_testers: app.required_testers,
            current_testers,
            status: app.status,
            completed_at: app.completed_at.map(|t| t.format(&Rfc3339).unwrap_or_default()),
            flag_count: app.flag_count,
            visibility_status: app.visibility_status,
            positive_votes: app.positive_votes,
            negative_votes: app.negative_votes,
            voters,
            created_at: app.created_at.format(&Rfc3339).unwrap_or_default(),
            updated_at: app.updated_at.format(&Rfc3339).unwrap_or_default(),
            is_duplicate,
            user,
        });
    }

    let total = result_apps.len();
    Ok(Json(AdminAppsResponse {
        apps: result_apps,
        total,
        duplicate_packages_count,
    }))
}

// ── DELETE /api/admin/apps/:id ─────────────────────────────────────────────────
// TS: cascade delete proofs/messages/matches/reports for app; decrement appsCount; optional ban
async fn admin_delete_app(
    State(state): State<AppState>,
    admin: AdminUser,
    Path(id): Path<String>,
    Query(query): Query<DeleteAppQuery>,
) -> Result<Json<GenericMessageResponse>, AppError> {
    let app = Apps::find_by_id(&id)
        .one(&state.db)
        .await
        .map_err(AppError::from)?
        .ok_or_else(|| AppError::NotFound("App not found".to_string()))?;

    // Get all matches for this app
    let app_matches = Matches::find()
        .filter(
            Condition::any()
                .add(matches::Column::App1Id.eq(&id))
                .add(matches::Column::App2Id.eq(&id)),
        )
        .all(&state.db)
        .await
        .unwrap_or_default();

    let match_ids: Vec<String> = app_matches.iter().map(|m| m.id.clone()).collect();
    for mid in &match_ids {
        let _ = Proofs::delete_many()
            .filter(crate::entities::proofs::Column::MatchId.eq(mid.as_str()))
            .exec(&state.db)
            .await;
        let _ = Messages::delete_many()
            .filter(messages::Column::MatchId.eq(mid.as_str()))
            .exec(&state.db)
            .await;
    }
    let _ = Matches::delete_many()
        .filter(
            Condition::any()
                .add(matches::Column::App1Id.eq(&id))
                .add(matches::Column::App2Id.eq(&id)),
        )
        .exec(&state.db)
        .await;
    let _ = Reports::delete_many()
        .filter(reports::Column::TargetId.eq(&id))
        .exec(&state.db)
        .await;
    let _ = Apps::delete_by_id(&id).exec(&state.db).await;

    // Optionally ban the package
    if query.ban_package.as_deref() == Some("true") {
        let reason = query.reason.unwrap_or_else(|| "Banned by Admin".to_string());
        let _ = app_bans::ActiveModel {
            id: Set(Uuid::new_v4().to_string()),
            package_name: Set(app.package_name.trim().to_string()),
            title: Set(Some(app.title.clone())),
            play_store_url: Set(Some(String::new())),
            banned_by: Set(admin.id.clone()),
            reason: Set(reason),
            created_at: Set(OffsetDateTime::now_utc()),
        }
        .insert(&state.db)
        .await;
    }

    Ok(Json(GenericMessageResponse {
        message: format!(
            "App \"{}\" ({}) has been deleted successfully.",
            app.title, app.package_name
        ),
    }))
}

// ── POST /api/admin/apps/clean-duplicates ─────────────────────────────────────
// TS: keep oldest per package; delete rest with cascade
async fn clean_duplicate_apps(
    State(state): State<AppState>,
    _admin: AdminUser,
) -> Result<Json<CleanDuplicatesResponse>, AppError> {
    let all_apps = Apps::find()
        .filter(apps::Column::Status.ne("archived"))
        .order_by_asc(apps::Column::CreatedAt)
        .all(&state.db)
        .await
        .map_err(AppError::from)?;

    let mut seen_packages = std::collections::HashSet::new();
    let mut duplicate_app_ids: Vec<String> = Vec::new();
    let mut cleaned_packages: std::collections::HashSet<String> = std::collections::HashSet::new();

    for app in all_apps {
        let pkg = app.package_name.trim().to_lowercase();
        if seen_packages.contains(&pkg) {
            cleaned_packages.insert(app.package_name.clone());
            duplicate_app_ids.push(app.id);
        } else {
            seen_packages.insert(pkg);
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
        let app_matches = Matches::find()
            .filter(
                Condition::any()
                    .add(matches::Column::App1Id.eq(app_id.as_str()))
                    .add(matches::Column::App2Id.eq(app_id.as_str())),
            )
            .all(&state.db)
            .await
            .unwrap_or_default();
        for m in &app_matches {
            let _ = Proofs::delete_many()
                .filter(crate::entities::proofs::Column::MatchId.eq(m.id.as_str()))
                .exec(&state.db)
                .await;
            let _ = Messages::delete_many()
                .filter(messages::Column::MatchId.eq(m.id.as_str()))
                .exec(&state.db)
                .await;
        }
        let _ = Matches::delete_many()
            .filter(
                Condition::any()
                    .add(matches::Column::App1Id.eq(app_id.as_str()))
                    .add(matches::Column::App2Id.eq(app_id.as_str())),
            )
            .exec(&state.db)
            .await;
        let _ = Reports::delete_many()
            .filter(reports::Column::TargetId.eq(app_id.as_str()))
            .exec(&state.db)
            .await;
        let _ = Apps::delete_by_id(app_id.as_str()).exec(&state.db).await;
    }

    let count = duplicate_app_ids.len();
    Ok(Json(CleanDuplicatesResponse {
        message: format!("Successfully cleaned {} duplicate app(s).", count),
        deleted_apps_count: count,
        cleaned_packages: cleaned_packages.into_iter().collect(),
    }))
}

// ── POST /api/admin/users/clean-test-users ─────────────────────────────────────
// TS: delete users matching test/stress/dummy/example.com patterns with full cascade
async fn clean_test_users(
    State(state): State<AppState>,
    admin: AdminUser,
) -> Result<Json<CleanTestUsersResponse>, AppError> {
    const ADMIN_EMAILS: &[&str] = &[
        "neerajlovecyber@gmail.com",
        "futureaistudio41@gmail.com",
        "theneerajsec@gmail.com",
    ];

    let all_users = Users::find().all(&state.db).await.map_err(AppError::from)?;

    let mut test_user_ids: Vec<String> = Vec::new();
    for u in all_users {
        if u.id == admin.id || u.is_admin {
            continue;
        }
        let email_lower = u.email.to_lowercase();
        let token_lower = u.token_identifier.as_deref().unwrap_or("").to_lowercase();
        let name_lower = u.name.to_lowercase();

        if ADMIN_EMAILS
            .iter()
            .any(|ae| email_lower.contains(&ae.to_lowercase()))
        {
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
            test_user_ids.push(u.id);
        }
    }

    if test_user_ids.is_empty() {
        return Ok(Json(CleanTestUsersResponse {
            message: "No test users found to delete.".to_string(),
            deleted_users_count: 0,
        }));
    }

    for uid in &test_user_ids {
        let _ = Proofs::delete_many()
            .filter(crate::entities::proofs::Column::UploaderId.eq(uid.as_str()))
            .exec(&state.db)
            .await;
        let _ = Messages::delete_many()
            .filter(messages::Column::SenderId.eq(uid.as_str()))
            .exec(&state.db)
            .await;
        let _ = Reports::delete_many()
            .filter(
                Condition::any()
                    .add(reports::Column::ReporterId.eq(uid.as_str()))
                    .add(reports::Column::TargetId.eq(uid.as_str())),
            )
            .exec(&state.db)
            .await;
        let _ = Matches::delete_many()
            .filter(
                Condition::any()
                    .add(matches::Column::User1Id.eq(uid.as_str()))
                    .add(matches::Column::User2Id.eq(uid.as_str())),
            )
            .exec(&state.db)
            .await;
        let _ = Apps::delete_many()
            .filter(apps::Column::UserId.eq(uid.as_str()))
            .exec(&state.db)
            .await;
        let _ = crate::entities::prelude::AdminMessages::delete_many()
            .filter(
                crate::entities::admin_messages::Column::SenderId.eq(uid.as_str()),
            )
            .exec(&state.db)
            .await;
        let _ = crate::entities::prelude::AdminChats::delete_many()
            .filter(
                crate::entities::admin_chats::Column::UserId.eq(uid.as_str()),
            )
            .exec(&state.db)
            .await;
        let _ = UserBans::delete_many()
            .filter(user_bans::Column::UserId.eq(uid.as_str()))
            .exec(&state.db)
            .await;
        let _ = Users::delete_by_id(uid.as_str()).exec(&state.db).await;
    }

    let count = test_user_ids.len();
    Ok(Json(CleanTestUsersResponse {
        message: format!("Successfully deleted {} dummy test users.", count),
        deleted_users_count: count,
    }))
}

// ── POST /api/admin/apps/clean-all ─────────────────────────────────────────────
// TS: delete proofs, messages, reports, matches, appBans, apps; reset appsCount
async fn clean_all_apps(
    State(state): State<AppState>,
    _admin: AdminUser,
) -> Result<Json<CleanupResultResponse>, AppError> {
    let _ = Proofs::delete_many().exec(&state.db).await;
    let _ = Messages::delete_many().exec(&state.db).await;
    let _ = Reports::delete_many().exec(&state.db).await;
    let _ = Matches::delete_many().exec(&state.db).await;
    let _ = AppBans::delete_many().exec(&state.db).await;

    let deleted = Apps::delete_many()
        .exec(&state.db)
        .await
        .map_err(AppError::from)?;

    Ok(Json(CleanupResultResponse {
        message: "All apps, matches, and testing records have been cleanly deleted.".to_string(),
        deleted_apps_count: Some(deleted.rows_affected as usize),
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
