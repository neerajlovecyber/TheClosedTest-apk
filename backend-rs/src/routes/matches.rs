use axum::{
    extract::{Path, Query, State},
    routing::{get, post},
    Json, Router,
};
use serde::{Deserialize, Serialize};
use sqlx::FromRow;
use time::{format_description::well_known::Rfc3339, OffsetDateTime};
use uuid::Uuid;

use crate::auth::AuthUser;
use crate::db::models::MatchRecord;
use crate::error::AppError;
use crate::state::AppState;

#[derive(Deserialize)]
pub struct ListMatchesQuery {
    pub status: Option<String>,
}

#[derive(Deserialize)]
pub struct RequestMatchRequest {
    #[serde(rename = "app1Id")]
    pub app1_id: String,
    #[serde(rename = "targetAppId")]
    pub target_app_id: String,
}

#[derive(Serialize)]
pub struct MatchAppSummary {
    pub id: String,
    pub title: String,
    #[serde(rename = "packageName")]
    pub package_name: String,
    #[serde(rename = "iconUrl")]
    pub icon_url: String,
}

#[derive(Serialize)]
pub struct MatchUserSummary {
    pub id: String,
    pub name: String,
    pub email: String,
    #[serde(rename = "avatarUrl")]
    pub avatar_url: Option<String>,
}

#[derive(Serialize)]
pub struct MatchDetailResponse {
    pub id: String,
    #[serde(rename = "user1Id")]
    pub user1_id: String,
    #[serde(rename = "app1Id")]
    pub app1_id: String,
    #[serde(rename = "user2Id")]
    pub user2_id: String,
    #[serde(rename = "app2Id")]
    pub app2_id: String,
    pub status: String,
    #[serde(rename = "startDate")]
    pub start_date: Option<String>,
    #[serde(rename = "lastActivity")]
    pub last_activity: String,
    #[serde(rename = "user1ApprovedCount")]
    pub user1_approved_count: i32,
    #[serde(rename = "user2ApprovedCount")]
    pub user2_approved_count: i32,
    #[serde(rename = "user1LastProof")]
    pub user1_last_proof: Option<serde_json::Value>,
    #[serde(rename = "user2LastProof")]
    pub user2_last_proof: Option<serde_json::Value>,
    #[serde(rename = "createdAt")]
    pub created_at: String,
    pub app1: Option<MatchAppSummary>,
    pub app2: Option<MatchAppSummary>,
    pub user1: Option<MatchUserSummary>,
    pub user2: Option<MatchUserSummary>,
}

#[derive(FromRow)]
struct MatchListRow {
    id: String,
    user1_id: String,
    app1_id: String,
    user2_id: String,
    app2_id: String,
    status: String,
    start_date: Option<OffsetDateTime>,
    last_activity: OffsetDateTime,
    user1_approved_count: i32,
    user2_approved_count: i32,
    user1_last_proof: Option<serde_json::Value>,
    user2_last_proof: Option<serde_json::Value>,
    created_at: OffsetDateTime,
    a1_title: String,
    a1_package: String,
    a1_icon: String,
    a2_title: String,
    a2_package: String,
    a2_icon: String,
    u1_name: String,
    u1_email: String,
    u1_avatar: Option<String>,
    u2_name: String,
    u2_email: String,
    u2_avatar: Option<String>,
}

// GET /api/matches
async fn list_matches(
    State(state): State<AppState>,
    AuthUser(user): AuthUser,
    Query(params): Query<ListMatchesQuery>,
) -> Result<Json<Vec<MatchDetailResponse>>, AppError> {
    let status_filter = params.status;

    let records = sqlx::query_as::<_, MatchListRow>(
        r#"
        SELECT 
            m.id, m.user1_id, m.app1_id, m.user2_id, m.app2_id, m.status,
            m.start_date, m.last_activity, m.user1_approved_count, m.user2_approved_count,
            m.user1_last_proof, m.user2_last_proof, m.created_at,
            a1.title as a1_title, a1.package_name as a1_package, a1.icon_url as a1_icon,
            a2.title as a2_title, a2.package_name as a2_package, a2.icon_url as a2_icon,
            u1.name as u1_name, u1.email as u1_email, u1.avatar_url as u1_avatar,
            u2.name as u2_name, u2.email as u2_email, u2.avatar_url as u2_avatar
        FROM matches m
        JOIN apps a1 ON m.app1_id = a1.id
        JOIN apps a2 ON m.app2_id = a2.id
        JOIN users u1 ON m.user1_id = u1.id
        JOIN users u2 ON m.user2_id = u2.id
        WHERE (m.user1_id = $1 OR m.user2_id = $1)
          AND ($2::text IS NULL OR m.status = $2)
        ORDER BY m.last_activity DESC
        "#,
    )
    .bind(&user.id)
    .bind(status_filter)
    .fetch_all(&state.pool)
    .await
    .map_err(AppError::Database)?;

    let results = records
        .into_iter()
        .map(|r| MatchDetailResponse {
            id: r.id,
            user1_id: r.user1_id,
            app1_id: r.app1_id.clone(),
            user2_id: r.user2_id.clone(),
            app2_id: r.app2_id.clone(),
            status: r.status,
            start_date: r.start_date.map(|t| t.format(&Rfc3339).unwrap_or_default()),
            last_activity: r.last_activity.format(&Rfc3339).unwrap_or_default(),
            user1_approved_count: r.user1_approved_count,
            user2_approved_count: r.user2_approved_count,
            user1_last_proof: r.user1_last_proof,
            user2_last_proof: r.user2_last_proof,
            created_at: r.created_at.format(&Rfc3339).unwrap_or_default(),
            app1: Some(MatchAppSummary {
                id: r.app1_id,
                title: r.a1_title,
                package_name: r.a1_package,
                icon_url: r.a1_icon,
            }),
            app2: Some(MatchAppSummary {
                id: r.app2_id,
                title: r.a2_title,
                package_name: r.a2_package,
                icon_url: r.a2_icon,
            }),
            user1: Some(MatchUserSummary {
                id: user.id.clone(),
                name: r.u1_name,
                email: r.u1_email,
                avatar_url: r.u1_avatar,
            }),
            user2: Some(MatchUserSummary {
                id: r.user2_id,
                name: r.u2_name,
                email: r.u2_email,
                avatar_url: r.u2_avatar,
            }),
        })
        .collect();

    Ok(Json(results))
}

// GET /api/matches/:id
async fn get_match(
    State(state): State<AppState>,
    AuthUser(user): AuthUser,
    Path(id): Path<String>,
) -> Result<Json<MatchDetailResponse>, AppError> {
    let r = sqlx::query_as::<_, MatchListRow>(
        r#"
        SELECT 
            m.id, m.user1_id, m.app1_id, m.user2_id, m.app2_id, m.status,
            m.start_date, m.last_activity, m.user1_approved_count, m.user2_approved_count,
            m.user1_last_proof, m.user2_last_proof, m.created_at,
            a1.title as a1_title, a1.package_name as a1_package, a1.icon_url as a1_icon,
            a2.title as a2_title, a2.package_name as a2_package, a2.icon_url as a2_icon,
            u1.name as u1_name, u1.email as u1_email, u1.avatar_url as u1_avatar,
            u2.name as u2_name, u2.email as u2_email, u2.avatar_url as u2_avatar
        FROM matches m
        JOIN apps a1 ON m.app1_id = a1.id
        JOIN apps a2 ON m.app2_id = a2.id
        JOIN users u1 ON m.user1_id = u1.id
        JOIN users u2 ON m.user2_id = u2.id
        WHERE m.id = $1
        "#,
    )
    .bind(id)
    .fetch_optional(&state.pool)
    .await
    .map_err(AppError::Database)?
    .ok_or_else(|| AppError::NotFound("Match not found".to_string()))?;

    // Check user is part of match or admin
    if r.user1_id != user.id && r.user2_id != user.id && !state.config.is_user_admin(Some(&user.email), user.is_admin) {
        return Err(AppError::Forbidden("Forbidden: Not a participant of this match".to_string()));
    }

    Ok(Json(MatchDetailResponse {
        id: r.id,
        user1_id: r.user1_id.clone(),
        app1_id: r.app1_id.clone(),
        user2_id: r.user2_id.clone(),
        app2_id: r.app2_id.clone(),
        status: r.status,
        start_date: r.start_date.map(|t| t.format(&Rfc3339).unwrap_or_default()),
        last_activity: r.last_activity.format(&Rfc3339).unwrap_or_default(),
        user1_approved_count: r.user1_approved_count,
        user2_approved_count: r.user2_approved_count,
        user1_last_proof: r.user1_last_proof,
        user2_last_proof: r.user2_last_proof,
        created_at: r.created_at.format(&Rfc3339).unwrap_or_default(),
        app1: Some(MatchAppSummary {
            id: r.app1_id,
            title: r.a1_title,
            package_name: r.a1_package,
            icon_url: r.a1_icon,
        }),
        app2: Some(MatchAppSummary {
            id: r.app2_id,
            title: r.a2_title,
            package_name: r.a2_package,
            icon_url: r.a2_icon,
        }),
        user1: Some(MatchUserSummary {
            id: r.user1_id,
            name: r.u1_name,
            email: r.u1_email,
            avatar_url: r.u1_avatar,
        }),
        user2: Some(MatchUserSummary {
            id: r.user2_id,
            name: r.u2_name,
            email: r.u2_email,
            avatar_url: r.u2_avatar,
        }),
    }))
}

// POST /api/matches/request
async fn request_match(
    State(state): State<AppState>,
    AuthUser(user): AuthUser,
    Json(payload): Json<RequestMatchRequest>,
) -> Result<Json<MatchRecord>, AppError> {
    // 1. Verify app1 belongs to user
    let app1: (String, String, String) = sqlx::query_as(
        "SELECT id, user_id, status FROM apps WHERE id = $1",
    )
    .bind(&payload.app1_id)
    .fetch_optional(&state.pool)
    .await
    .map_err(AppError::Database)?
    .ok_or_else(|| AppError::NotFound("Your selected app was not found".to_string()))?;

    if app1.1 != user.id {
        return Err(AppError::Forbidden("You do not own the app you are requesting swap with".to_string()));
    }

    // 2. Verify target app
    let app2: (String, String, String) = sqlx::query_as(
        "SELECT id, user_id, status FROM apps WHERE id = $1",
    )
    .bind(&payload.target_app_id)
    .fetch_optional(&state.pool)
    .await
    .map_err(AppError::Database)?
    .ok_or_else(|| AppError::NotFound("Target app not found".to_string()))?;

    if app2.1 == user.id {
        return Err(AppError::BadRequest("Cannot request a test swap with your own app".to_string()));
    }

    // 3. Verify no existing pending or active match
    let existing: Option<(String,)> = sqlx::query_as(
        r#"
        SELECT id FROM matches
        WHERE ((app1_id = $1 AND app2_id = $2) OR (app1_id = $2 AND app2_id = $1))
          AND status IN ('pending', 'active')
        "#,
    )
    .bind(&payload.app1_id)
    .bind(&payload.target_app_id)
    .fetch_optional(&state.pool)
    .await
    .map_err(AppError::Database)?;

    if existing.is_some() {
        return Err(AppError::Conflict("A match request or active test already exists between these apps".to_string()));
    }

    let new_id = Uuid::new_v4().to_string();
    let record = sqlx::query_as::<_, MatchRecord>(
        r#"
        INSERT INTO matches (
            id, user1_id, app1_id, user2_id, app2_id, status,
            user1_approved_count, user2_approved_count, last_activity,
            created_at, updated_at
        )
        VALUES ($1, $2, $3, $4, $5, 'pending', 0, 0, NOW(), NOW(), NOW())
        RETURNING id, user1_id, app1_id, user2_id, app2_id, status,
                  start_date, last_activity, last_read1, last_read2, completed_at,
                  user1_approved_count, user2_approved_count,
                  user1_last_proof, user2_last_proof, created_at, updated_at
        "#,
    )
    .bind(new_id)
    .bind(&user.id)
    .bind(&app1.0)
    .bind(&app2.1)
    .bind(&app2.0)
    .fetch_one(&state.pool)
    .await
    .map_err(AppError::Database)?;

    Ok(Json(record))
}

#[derive(Serialize)]
pub struct GenericMessageResponse {
    pub message: String,
}

// POST /api/matches/:id/accept
async fn accept_match(
    State(state): State<AppState>,
    AuthUser(user): AuthUser,
    Path(id): Path<String>,
) -> Result<Json<MatchRecord>, AppError> {
    let match_row = sqlx::query_as::<_, MatchRecord>(
        "SELECT id, user1_id, app1_id, user2_id, app2_id, status, start_date, last_activity, last_read1, last_read2, completed_at, user1_approved_count, user2_approved_count, user1_last_proof, user2_last_proof, created_at, updated_at FROM matches WHERE id = $1",
    )
    .bind(&id)
    .fetch_optional(&state.pool)
    .await
    .map_err(AppError::Database)?
    .ok_or_else(|| AppError::NotFound("Match not found".to_string()))?;

    if match_row.user2_id != user.id || match_row.status != "pending" {
        return Err(AppError::Forbidden("Only the target recipient can accept a pending match request".to_string()));
    }

    let updated = sqlx::query_as::<_, MatchRecord>(
        r#"
        UPDATE matches
        SET status = 'active', start_date = NOW(), last_activity = NOW(), updated_at = NOW()
        WHERE id = $1
        RETURNING id, user1_id, app1_id, user2_id, app2_id, status,
                  start_date, last_activity, last_read1, last_read2, completed_at,
                  user1_approved_count, user2_approved_count,
                  user1_last_proof, user2_last_proof, created_at, updated_at
        "#,
    )
    .bind(&id)
    .fetch_one(&state.pool)
    .await
    .map_err(AppError::Database)?;

    // Send notification to user1
    let notif_id = Uuid::new_v4().to_string();
    let notif_data = serde_json::json!({ "matchId": id });
    let _ = sqlx::query(
        "INSERT INTO notifications (id, user_id, type, title, body, data, read, created_at) VALUES ($1, $2, 'acceptance', 'Match Accepted!', 'Your testing exchange was accepted! Day 1 testing starts today.', $3, false, NOW())",
    )
    .bind(notif_id)
    .bind(&match_row.user1_id)
    .bind(notif_data)
    .execute(&state.pool)
    .await;

    Ok(Json(updated))
}

// POST /api/matches/:id/cancel
async fn cancel_match(
    State(state): State<AppState>,
    AuthUser(user): AuthUser,
    Path(id): Path<String>,
) -> Result<Json<GenericMessageResponse>, AppError> {
    let match_row = sqlx::query_as::<_, MatchRecord>(
        "SELECT id, user1_id, app1_id, user2_id, app2_id, status, start_date, last_activity, last_read1, last_read2, completed_at, user1_approved_count, user2_approved_count, user1_last_proof, user2_last_proof, created_at, updated_at FROM matches WHERE id = $1",
    )
    .bind(&id)
    .fetch_optional(&state.pool)
    .await
    .map_err(AppError::Database)?
    .ok_or_else(|| AppError::NotFound("Match not found".to_string()))?;

    let is_part = match_row.user1_id == user.id || match_row.user2_id == user.id;
    if !is_part && !state.config.is_user_admin(Some(&user.email), user.is_admin) {
        return Err(AppError::Forbidden("You are not authorized to cancel this match".to_string()));
    }

    sqlx::query("UPDATE matches SET status = 'cancelled', updated_at = NOW() WHERE id = $1")
        .bind(&id)
        .execute(&state.pool)
        .await
        .map_err(AppError::Database)?;

    // Notify other user
    let other_user_id = if match_row.user1_id == user.id { match_row.user2_id } else { match_row.user1_id };
    let notif_id = Uuid::new_v4().to_string();
    let notif_data = serde_json::json!({ "matchId": id });
    let _ = sqlx::query(
        "INSERT INTO notifications (id, user_id, type, title, body, data, read, created_at) VALUES ($1, $2, 'match_cancelled', 'Testing Match Cancelled', 'A testing match has been cancelled.', $3, false, NOW())",
    )
    .bind(notif_id)
    .bind(other_user_id)
    .bind(notif_data)
    .execute(&state.pool)
    .await;

    Ok(Json(GenericMessageResponse {
        message: "Match cancelled successfully".to_string(),
    }))
}

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/api/matches", get(list_matches))
        .route("/api/matches/request", post(request_match))
        .route("/api/matches/:id", get(get_match))
        .route("/api/matches/:id/accept", post(accept_match))
        .route("/api/matches/:id/cancel", post(cancel_match))
}
