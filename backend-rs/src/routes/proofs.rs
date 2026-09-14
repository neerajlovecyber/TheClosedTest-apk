use axum::{
    extract::{Path, State},
    routing::{get, post},
    Json, Router,
};
use serde::{Deserialize, Serialize};
use time::{format_description::well_known::Rfc3339, OffsetDateTime};
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

    if status != "active" && status != "pending" {
        return Err(AppError::BadRequest("Match is not active or does not exist".to_string()));
    }

    // Auto-activate match if it was still pending (parity with TS proof.service.ts)
    if status == "pending" {
        let _ = sqlx::query("UPDATE matches SET status = 'active', start_date = NOW(), updated_at = NOW() WHERE id = $1")
            .bind(&m_id)
            .execute(&state.pool)
            .await;
    }

    if u1_id != user.id && u2_id != user.id {
        return Err(AppError::Forbidden("You are not a participant in this match".to_string()));
    }

    let is_user1 = u1_id == user.id;
    let urls_json = serde_json::to_value(&payload.storage_urls).unwrap_or_default();

    // Check if proof exists for this day to replace (parity with TS proof.service.ts)
    let existing_proof: Option<(String,)> = sqlx::query_as(
        "SELECT id FROM proofs WHERE match_id = $1 AND uploader_id = $2 AND day = $3",
    )
    .bind(&m_id)
    .bind(&user.id)
    .bind(payload.day)
    .fetch_optional(&state.pool)
    .await
    .map_err(AppError::Database)?;

    let record = if let Some((existing_id,)) = existing_proof {
        sqlx::query_as::<_, ProofRecord>(
            r#"
            UPDATE proofs
            SET storage_urls = $1, status = 'pending', comment = $2, type = $3, rejection_reason = NULL, submitted_at = NOW(), reviewed_at = NULL
            WHERE id = $4
            RETURNING id, match_id, uploader_id, day, type, storage_urls, status, comment, rejection_reason,
                      submitted_at, reviewed_at
            "#,
        )
        .bind(urls_json)
        .bind(payload.comment)
        .bind(payload.r#type)
        .bind(existing_id)
        .fetch_one(&state.pool)
        .await
        .map_err(AppError::Database)?
    } else {
        let new_id = Uuid::new_v4().to_string();
        sqlx::query_as::<_, ProofRecord>(
            r#"
            INSERT INTO proofs (
                id, match_id, uploader_id, day, type, storage_urls, status, comment, submitted_at
            )
            VALUES ($1, $2, $3, $4, $5, $6, 'pending', $7, NOW())
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
        .map_err(AppError::Database)?
    };

    // Update match last activity
    let _ = sqlx::query("UPDATE matches SET last_activity = NOW(), updated_at = NOW() WHERE id = $1")
        .bind(&m_id)
        .execute(&state.pool)
        .await;

    let partner_id = if is_user1 { u2_id } else { u1_id };

    // Send in-app notification to partner
    let notif_id = Uuid::new_v4().to_string();
    let notif_data = serde_json::json!({
        "matchId": m_id,
        "proofId": record.id,
        "day": payload.day,
    });
    let notif_title = format!("Day {} Proof Uploaded!", payload.day);
    let notif_body = format!("{} uploaded testing proof for Day {}. Please review it.", user.name, payload.day);
    let _ = sqlx::query(
        "INSERT INTO notifications (id, user_id, type, title, body, data, read, created_at) VALUES ($1, $2, 'proof_update', $3, $4, $5, false, NOW())",
    )
    .bind(notif_id)
    .bind(&partner_id)
    .bind(&notif_title)
    .bind(&notif_body)
    .bind(&notif_data)
    .execute(&state.pool)
    .await;

    // Send push notification to partner
    let partner_push_token: Option<(Option<String>,)> = sqlx::query_as(
        "SELECT push_token FROM users WHERE id = $1",
    )
    .bind(&partner_id)
    .fetch_optional(&state.pool)
    .await
    .unwrap_or(None);

    if let Some((Some(push_token),)) = partner_push_token {
        let push_client = reqwest::Client::new();
        let push_title = notif_title;
        let push_body = format!("{} uploaded proof for Day {}. Review it now!", user.name, payload.day);
        let push_data = notif_data;
        tokio::spawn(async move {
            crate::services::push::send_push_notification(
                &push_client,
                &push_token,
                push_title,
                push_body,
                push_data,
            ).await;
        });
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
    .bind(payload.rejection_reason.as_deref())
    .bind(&id)
    .fetch_one(&state.pool)
    .await
    .map_err(AppError::Database)?;

    let is_user1_uploader = proof.uploader_id == u1_id;

    // 1. Update match approval count and last activity
    if is_user1_uploader {
        let query = if new_status == "approved" {
            "UPDATE matches SET user1_approved_count = user1_approved_count + 1, last_activity = NOW(), updated_at = NOW() WHERE id = $1"
        } else {
            "UPDATE matches SET last_activity = NOW(), updated_at = NOW() WHERE id = $1"
        };
        let _ = sqlx::query(query)
            .bind(&proof.match_id)
            .execute(&state.pool)
            .await;
    } else {
        let query = if new_status == "approved" {
            "UPDATE matches SET user2_approved_count = user2_approved_count + 1, last_activity = NOW(), updated_at = NOW() WHERE id = $1"
        } else {
            "UPDATE matches SET last_activity = NOW(), updated_at = NOW() WHERE id = $1"
        };
        let _ = sqlx::query(query)
            .bind(&proof.match_id)
            .execute(&state.pool)
            .await;
    }

    // 2. Adjust reputation: +1 for approved, -5 for rejected (minimum 0)
    if new_status == "approved" {
        let _ = sqlx::query("UPDATE users SET reputation = reputation + 1, updated_at = NOW() WHERE id = $1")
            .bind(&proof.uploader_id)
            .execute(&state.pool)
            .await;
    } else {
        let _ = sqlx::query("UPDATE users SET reputation = GREATEST(0, reputation - 5), updated_at = NOW() WHERE id = $1")
            .bind(&proof.uploader_id)
            .execute(&state.pool)
            .await;
    }

    // 3. Match completion check & +20 reputation reward (parity with TS proof.service.ts lines 220-259)
    if new_status == "approved" {
        let all_proofs = sqlx::query_as::<_, ProofRecord>(
            "SELECT id, match_id, uploader_id, day, type, storage_urls, status, comment, rejection_reason, submitted_at, reviewed_at FROM proofs WHERE match_id = $1"
        )
        .bind(&proof.match_id)
        .fetch_all(&state.pool)
        .await
        .unwrap_or_default();

        let match_full: Option<(Option<OffsetDateTime>, OffsetDateTime, String, i32, i32)> = sqlx::query_as(
            "SELECT start_date, created_at, status, user1_approved_count, user2_approved_count FROM matches WHERE id = $1"
        )
        .bind(&proof.match_id)
        .fetch_optional(&state.pool)
        .await
        .unwrap_or(None);

        if let Some((start_date, created_at, current_match_status, u1_appr, u2_appr)) = match_full {
            let now = OffsetDateTime::now_utc();
            let match_start = start_date.unwrap_or(created_at);
            let fourteen_days_elapsed = (now - match_start).whole_days() >= 14;

            let user1_reached_day14 = if is_user1_uploader {
                proof.day >= 14
            } else {
                all_proofs.iter().any(|p| p.uploader_id == u1_id && p.day >= 14)
            };

            let user2_reached_day14 = if !is_user1_uploader {
                proof.day >= 14
            } else {
                all_proofs.iter().any(|p| p.uploader_id == u2_id && p.day >= 14)
            };

            let has_other_pending = all_proofs.iter().any(|p| p.id != proof.id && p.status == "pending");

            let both_14_approved = u1_appr >= 14 && u2_appr >= 14;
            let cycle_concluded = !has_other_pending && (fourteen_days_elapsed || (user1_reached_day14 && user2_reached_day14));
            let both_completed = both_14_approved || cycle_concluded;

            if both_completed && current_match_status != "completed" {
                let _ = sqlx::query("UPDATE matches SET status = 'completed', completed_at = NOW(), updated_at = NOW() WHERE id = $1")
                    .bind(&proof.match_id)
                    .execute(&state.pool)
                    .await;

                let _ = sqlx::query("UPDATE users SET reputation = reputation + 20, updated_at = NOW() WHERE id IN ($1, $2)")
                    .bind(&u1_id)
                    .bind(&u2_id)
                    .execute(&state.pool)
                    .await;
            }
        }
    }

    // 3. Notify uploader about review outcome
    let notif_id = Uuid::new_v4().to_string();
    let notif_data = serde_json::json!({
        "matchId": proof.match_id,
        "proofId": proof.id,
        "day": proof.day,
        "status": new_status,
    });
    let (notif_type, notif_title, notif_body) = if new_status == "approved" {
        (
            "proof_approved",
            "Proof Approved!",
            format!("Your Day {} proof was approved by your partner!", proof.day),
        )
    } else {
        (
            "proof_rejected",
            "Proof Rejected",
            format!(
                "Your Day {} proof was rejected: {}",
                proof.day,
                payload.rejection_reason.as_deref().unwrap_or("No reason provided")
            ),
        )
    };

    let _ = sqlx::query(
        "INSERT INTO notifications (id, user_id, type, title, body, data, read, created_at) VALUES ($1, $2, $3, $4, $5, $6, false, NOW())",
    )
    .bind(notif_id)
    .bind(&proof.uploader_id)
    .bind(notif_type)
    .bind(notif_title)
    .bind(&notif_body)
    .bind(&notif_data)
    .execute(&state.pool)
    .await;

    // Send push notification to uploader
    let uploader_push_token: Option<(Option<String>,)> = sqlx::query_as(
        "SELECT push_token FROM users WHERE id = $1",
    )
    .bind(&proof.uploader_id)
    .fetch_optional(&state.pool)
    .await
    .unwrap_or(None);

    if let Some((Some(push_token),)) = uploader_push_token {
        let push_client = reqwest::Client::new();
        let push_title = notif_title.to_string();
        let push_body = notif_body;
        let push_data = notif_data;
        tokio::spawn(async move {
            crate::services::push::send_push_notification(
                &push_client,
                &push_token,
                push_title,
                push_body,
                push_data,
            ).await;
        });
    }

    Ok(Json(updated.into()))
}

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/api/proofs", post(submit_proof))
        .route("/api/proofs/match/{match_id}", get(list_match_proofs))
        .route("/api/proofs/{id}/review", post(review_proof))
}
