use axum::{
    extract::{Path, State},
    routing::{get, patch, post},
    Json, Router,
};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

use crate::auth::AdminUser;
use crate::error::AppError;
use crate::state::AppState;

#[derive(Serialize)]
pub struct ReportItem {
    pub id: String,
    #[serde(rename = "reporterId")]
    pub reporter_id: String,
    pub r#type: String,
    #[serde(rename = "targetId")]
    pub target_id: String,
    pub description: String,
    pub status: String,
    #[serde(rename = "adminNotes")]
    pub admin_notes: Option<String>,
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

#[derive(Serialize)]
pub struct GenericMessageResponse {
    pub message: String,
}

// GET /api/admin/reports
async fn list_reports(
    State(state): State<AppState>,
    _admin: AdminUser,
) -> Result<Json<Vec<ReportItem>>, AppError> {
    let records = sqlx::query_as::<_, (String, String, String, String, String, String, Option<String>)>(
        "SELECT id, reporter_id, type, target_id, description, status, admin_notes FROM reports ORDER BY created_at DESC LIMIT 50",
    )
    .fetch_all(&state.pool)
    .await
    .map_err(AppError::Database)?;

    let reports = records
        .into_iter()
        .map(|(id, reporter_id, r_type, target_id, description, status, admin_notes)| ReportItem {
            id,
            reporter_id,
            r#type: r_type,
            target_id,
            description,
            status,
            admin_notes,
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

    // Invalidate user in cache
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

    // Archive any active app with that package name
    sqlx::query("UPDATE apps SET status = 'archived', updated_at = NOW() WHERE LOWER(package_name) = LOWER($1)")
        .bind(payload.package_name.trim())
        .execute(&state.pool)
        .await
        .map_err(AppError::Database)?;

    Ok(Json(GenericMessageResponse {
        message: "App package banned and active apps archived".to_string(),
    }))
}

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/api/admin/reports", get(list_reports))
        .route("/api/admin/reports/:id", patch(update_report))
        .route("/api/admin/bans/user", post(ban_user))
        .route("/api/admin/bans/app", post(ban_app))
}
