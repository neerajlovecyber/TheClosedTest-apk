use axum::{
    extract::{Path, State},
    routing::{get, post},
    Json, Router,
};
use serde::{Deserialize, Serialize};
use time::format_description::well_known::Rfc3339;
use uuid::Uuid;

use crate::auth::AuthUser;
use crate::db::models::ProofRecord;
use crate::error::AppError;
use crate::state::AppState;

#[derive(Deserialize)]
pub struct SubmitProofRequest {
    #[serde(rename = "matchId")]
    pub match_id: String,
    pub day: i32,
    #[serde(default = "default_type")]
    pub r#type: String,
    #[serde(rename = "storageUrls")]
    pub storage_urls: Vec<String>,
    pub comment: Option<String>,
}

fn default_type() -> String {
    "image".to_string()
}

#[derive(Deserialize)]
pub struct ReviewProofRequest {
    pub status: String, // "approved" or "rejected"
    #[serde(rename = "rejectionReason")]
    pub rejection_reason: Option<String>,
}

#[derive(Serialize)]
pub struct ProofResponse {
    pub id: String,
    #[serde(rename = "matchId")]
    pub match_id: String,
    #[serde(rename = "uploaderId")]
    pub uploader_id: String,
    pub day: i32,
    pub r#type: String,
    #[serde(rename = "storageUrls")]
    pub storage_urls: Vec<String>,
    pub status: String,
    pub comment: Option<String>,
    #[serde(rename = "rejectionReason")]
    pub rejection_reason: Option<String>,
    #[serde(rename = "submittedAt")]
    pub submitted_at: String,
    #[serde(rename = "reviewedAt")]
    pub reviewed_at: Option<String>,
}

impl From<ProofRecord> for ProofResponse {
    fn from(p: ProofRecord) -> Self {
        let urls: Vec<String> = serde_json::from_value(p.storage_urls).unwrap_or_default();
        Self {
            id: p.id,
            match_id: p.match_id,
            uploader_id: p.uploader_id,
            day: p.day,
            r#type: p.r#type,
            storage_urls: urls,
            status: p.status,
            comment: p.comment,
            rejection_reason: p.rejection_reason,
            submitted_at: p.submitted_at.format(&Rfc3339).unwrap_or_default(),
            reviewed_at: p.reviewed_at.map(|t| t.format(&Rfc3339).unwrap_or_default()),
        }
    }
}

// POST /api/proofs
async fn submit_proof(
    State(state): State<AppState>,
    AuthUser(user): AuthUser,
    Json(payload): Json<SubmitProofRequest>,
) -> Result<Json<ProofResponse>, AppError> {
    if payload.day < 1 || payload.day > 14 {
        return Err(AppError::BadRequest("Proof day must be between 1 and 14".to_string()));
    }
    if payload.storage_urls.is_empty() {
        return Err(AppError::BadRequest("At least one storage URL is required".to_string()));
    }

    // Verify user is part of active match
    let match_info: Option<(String, String, String, String)> = sqlx::query_as(
        "SELECT id, user1_id, user2_id, status FROM matches WHERE id = $1",
    )
    .bind(&payload.match_id)
    .fetch_optional(&state.pool)
    .await
    .map_err(AppError::Database)?;

    let (m_id, u1_id, u2_id, status) = match_info
        .ok_or_else(|| AppError::NotFound("Match not found".to_string()))?;

    if status != "active" {
        return Err(AppError::BadRequest("Cannot submit proofs for a match that is not active".to_string()));
    }
    if u1_id != user.id && u2_id != user.id {
        return Err(AppError::Forbidden("You are not a participant in this match".to_string()));
    }

    let is_user1 = u1_id == user.id;
    let new_id = Uuid::new_v4().to_string();
    let urls_json = serde_json::to_value(&payload.storage_urls).unwrap_or_default();

    let record = sqlx::query_as::<_, ProofRecord>(
        r#"
        INSERT INTO proofs (
            id, match_id, uploader_id, day, type, storage_urls, status, comment, submitted_at
        )
        VALUES ($1, $2, $3, $4, $5, 'pending', $6, $7, NOW())
        RETURNING id, match_id, uploader_id, day, type, storage_urls, status, comment, rejection_reason,
                  submitted_at, reviewed_at
        "#,
    )
    .bind(new_id)
    .bind(&m_id)
    .bind(&user.id)
    .bind(payload.day)
    .bind(payload.r#type)
    .bind(urls_json)
    .bind(payload.comment)
    .fetch_one(&state.pool)
    .await
    .map_err(AppError::Database)?;

    // Update match last activity and last proof snapshot
    let proof_summary = serde_json::json!({
        "day": payload.day,
        "status": "pending",
        "updatedAt": record.submitted_at.format(&Rfc3339).unwrap_or_default()
    });

    if is_user1 {
        sqlx::query("UPDATE matches SET user1_last_proof = $1, last_activity = NOW(), updated_at = NOW() WHERE id = $2")
            .bind(proof_summary)
            .bind(&m_id)
            .execute(&state.pool)
            .await
            .map_err(AppError::Database)?;
    } else {
        sqlx::query("UPDATE matches SET user2_last_proof = $1, last_activity = NOW(), updated_at = NOW() WHERE id = $2")
            .bind(proof_summary)
            .bind(&m_id)
            .execute(&state.pool)
            .await
            .map_err(AppError::Database)?;
    }

    Ok(Json(record.into()))
}

// GET /api/proofs/match/:match_id
async fn list_match_proofs(
    State(state): State<AppState>,
    AuthUser(user): AuthUser,
    Path(match_id): Path<String>,
) -> Result<Json<Vec<ProofResponse>>, AppError> {
    let match_info: Option<(String, String)> = sqlx::query_as(
        "SELECT user1_id, user2_id FROM matches WHERE id = $1",
    )
    .bind(&match_id)
    .fetch_optional(&state.pool)
    .await
    .map_err(AppError::Database)?;

    let (u1_id, u2_id) = match_info
        .ok_or_else(|| AppError::NotFound("Match not found".to_string()))?;

    if u1_id != user.id && u2_id != user.id && !state.config.is_user_admin(Some(&user.email), user.is_admin) {
        return Err(AppError::Forbidden("You are not authorized to view proofs for this match".to_string()));
    }

    let records = sqlx::query_as::<_, ProofRecord>(
        "SELECT id, match_id, uploader_id, day, type, storage_urls, status, comment, rejection_reason, submitted_at, reviewed_at FROM proofs WHERE match_id = $1 ORDER BY day ASC, submitted_at DESC",
    )
    .bind(match_id)
    .fetch_all(&state.pool)
    .await
    .map_err(AppError::Database)?;

    let proofs = records.into_iter().map(ProofResponse::from).collect();
    Ok(Json(proofs))
}

// POST /api/proofs/:id/review
async fn review_proof(
    State(state): State<AppState>,
    AuthUser(user): AuthUser,
    Path(id): Path<String>,
    Json(payload): Json<ReviewProofRequest>,
) -> Result<Json<ProofResponse>, AppError> {
    let proof = sqlx::query_as::<_, ProofRecord>(
        "SELECT id, match_id, uploader_id, day, type, storage_urls, status, comment, rejection_reason, submitted_at, reviewed_at FROM proofs WHERE id = $1",
    )
    .bind(&id)
    .fetch_optional(&state.pool)
    .await
    .map_err(AppError::Database)?
    .ok_or_else(|| AppError::NotFound("Proof not found".to_string()))?;

    // Only the tester's partner (or admin) can review the proof
    let match_row: Option<(String, String)> = sqlx::query_as(
        "SELECT user1_id, user2_id FROM matches WHERE id = $1",
    )
    .bind(&proof.match_id)
    .fetch_optional(&state.pool)
    .await
    .map_err(AppError::Database)?;

    let (u1_id, u2_id) = match_row
        .ok_or_else(|| AppError::NotFound("Associated match not found".to_string()))?;

    let is_reviewer = (proof.uploader_id == u1_id && user.id == u2_id)
        || (proof.uploader_id == u2_id && user.id == u1_id);

    if !is_reviewer && !state.config.is_user_admin(Some(&user.email), user.is_admin) {
        return Err(AppError::Forbidden("Only your testing partner can review this proof".to_string()));
    }

    let new_status = if payload.status == "approved" { "approved" } else { "rejected" };

    let updated = sqlx::query_as::<_, ProofRecord>(
        r#"
        UPDATE proofs
        SET status = $1, rejection_reason = $2, reviewed_at = NOW()
        WHERE id = $3
        RETURNING id, match_id, uploader_id, day, type, storage_urls, status, comment, rejection_reason,
                  submitted_at, reviewed_at
        "#,
    )
    .bind(new_status)
    .bind(payload.rejection_reason)
    .bind(&id)
    .fetch_one(&state.pool)
    .await
    .map_err(AppError::Database)?;

    // If approved, update approved count on match and reward uploader with +1 reputation
    if new_status == "approved" {
        if proof.uploader_id == u1_id {
            sqlx::query("UPDATE matches SET user1_approved_count = user1_approved_count + 1, last_activity = NOW() WHERE id = $1")
                .bind(&proof.match_id)
                .execute(&state.pool)
                .await
                .map_err(AppError::Database)?;
        } else {
            sqlx::query("UPDATE matches SET user2_approved_count = user2_approved_count + 1, last_activity = NOW() WHERE id = $1")
                .bind(&proof.match_id)
                .execute(&state.pool)
                .await
                .map_err(AppError::Database)?;
        }

        let _ = sqlx::query("UPDATE users SET reputation = reputation + 1, updated_at = NOW() WHERE id = $1")
            .bind(&proof.uploader_id)
            .execute(&state.pool)
            .await;
    }

    Ok(Json(updated.into()))
}

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/api/proofs", post(submit_proof))
        .route("/api/proofs/match/{match_id}", get(list_match_proofs))
        .route("/api/proofs/{id}/review", post(review_proof))
}
