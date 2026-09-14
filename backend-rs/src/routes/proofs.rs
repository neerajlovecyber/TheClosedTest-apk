use axum::{
    extract::{Path, State},
    routing::{get, post},
    Json, Router,
};
use sea_orm::{ActiveModelTrait, ColumnTrait, EntityTrait, QueryFilter, QueryOrder, Set};
use serde::{Deserialize, Serialize};
use time::{format_description::well_known::Rfc3339, OffsetDateTime};
use uuid::Uuid;

use crate::auth::AuthUser;
use crate::db::models::ProofRecord;
use crate::entities::prelude::*;
use crate::entities::{matches, notifications, proofs, users};
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

impl From<proofs::Model> for ProofResponse {
    fn from(p: proofs::Model) -> Self {
        let urls: Vec<String> = if let Some(arr) = p.storage_urls.as_array() {
            arr.iter().filter_map(|v| v.as_str().map(String::from)).collect()
        } else {
            serde_json::from_value(p.storage_urls).unwrap_or_default()
        };
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

    let match_row = Matches::find_by_id(&payload.match_id)
        .one(&state.db)
        .await?
        .ok_or_else(|| AppError::NotFound("Match not found".to_string()))?;

    if match_row.status != "active" && match_row.status != "pending" {
        return Err(AppError::BadRequest("Match is not active or does not exist".to_string()));
    }

    let is_user1 = match_row.user1_id == user.id;
    let is_user2 = match_row.user2_id == user.id;
    if !is_user1 && !is_user2 {
        return Err(AppError::Forbidden("You are not a participant in this match".to_string()));
    }

    let now = OffsetDateTime::now_utc();

    // Auto-activate match if it was still pending (parity with TS proof.service.ts)
    if match_row.status == "pending" {
        let mut match_act: matches::ActiveModel = match_row.clone().into();
        match_act.status = Set("active".to_string());
        match_act.start_date = Set(Some(now));
        match_act.updated_at = Set(now);
        match_act.update(&state.db).await?;
    }

    let partner_id = if is_user1 { match_row.user2_id.clone() } else { match_row.user1_id.clone() };
    let urls_json = serde_json::to_value(&payload.storage_urls).unwrap_or_default();

    // Check if proof exists for this day to replace (parity with TS proof.service.ts)
    let existing_proof = Proofs::find()
        .filter(proofs::Column::MatchId.eq(&match_row.id))
        .filter(proofs::Column::UploaderId.eq(&user.id))
        .filter(proofs::Column::Day.eq(payload.day))
        .one(&state.db)
        .await?;

    let record = if let Some(existing) = existing_proof {
        let mut proof_act: proofs::ActiveModel = existing.into();
        proof_act.storage_urls = Set(urls_json);
        proof_act.status = Set("pending".to_string());
        proof_act.comment = Set(payload.comment);
        proof_act.r#type = Set(payload.r#type);
        proof_act.rejection_reason = Set(None);
        proof_act.submitted_at = Set(now);
        proof_act.reviewed_at = Set(None);
        proof_act.update(&state.db).await?
    } else {
        let new_id = Uuid::new_v4().to_string();
        let new_proof = proofs::ActiveModel {
            id: Set(new_id),
            match_id: Set(match_row.id.clone()),
            uploader_id: Set(user.id.clone()),
            day: Set(payload.day),
            r#type: Set(payload.r#type),
            storage_urls: Set(urls_json),
            status: Set("pending".to_string()),
            comment: Set(payload.comment),
            rejection_reason: Set(None),
            submitted_at: Set(now),
            reviewed_at: Set(None),
        };
        new_proof.insert(&state.db).await?
    };

    // Update match last activity
    let mut match_act: matches::ActiveModel = match_row.into();
    match_act.last_activity = Set(now);
    match_act.updated_at = Set(now);
    let _ = match_act.update(&state.db).await;

    // Send in-app notification to partner
    let notif_id = Uuid::new_v4().to_string();
    let notif_data = serde_json::json!({
        "matchId": payload.match_id,
        "proofId": record.id,
        "day": payload.day,
    });
    let notif_title = format!("Day {} Proof Uploaded!", payload.day);
    let notif_body = format!("{} uploaded testing proof for Day {}. Please review it.", user.name, payload.day);

    let notif_act = notifications::ActiveModel {
        id: Set(notif_id),
        user_id: Set(partner_id.clone()),
        r#type: Set("proof_update".to_string()),
        title: Set(notif_title.clone()),
        body: Set(notif_body.clone()),
        data: Set(notif_data.clone()),
        read: Set(false),
        created_at: Set(now),
    };
    let _ = notif_act.insert(&state.db).await;

    // Send push notification to partner
    if let Ok(Some(partner_user)) = Users::find_by_id(&partner_id).one(&state.db).await {
        if let Some(push_token) = partner_user.push_token {
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
    }

    Ok(Json(record.into()))
}

// GET /api/proofs/match/:match_id
async fn list_match_proofs(
    State(state): State<AppState>,
    AuthUser(user): AuthUser,
    Path(match_id): Path<String>,
) -> Result<Json<Vec<ProofResponse>>, AppError> {
    let match_row = Matches::find_by_id(&match_id)
        .one(&state.db)
        .await?
        .ok_or_else(|| AppError::NotFound("Match not found".to_string()))?;

    if match_row.user1_id != user.id && match_row.user2_id != user.id && !state.config.is_user_admin(Some(&user.email), user.is_admin) {
        return Err(AppError::Forbidden("You are not authorized to view proofs for this match".to_string()));
    }

    let records = Proofs::find()
        .filter(proofs::Column::MatchId.eq(&match_id))
        .order_by_asc(proofs::Column::Day)
        .order_by_desc(proofs::Column::SubmittedAt)
        .all(&state.db)
        .await?;

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
    let proof = Proofs::find_by_id(&id)
        .one(&state.db)
        .await?
        .ok_or_else(|| AppError::NotFound("Proof not found".to_string()))?;

    let match_row = Matches::find_by_id(&proof.match_id)
        .one(&state.db)
        .await?
        .ok_or_else(|| AppError::NotFound("Associated match not found".to_string()))?;

    let is_reviewer = (proof.uploader_id == match_row.user1_id && user.id == match_row.user2_id)
        || (proof.uploader_id == match_row.user2_id && user.id == match_row.user1_id);

    if !is_reviewer && !state.config.is_user_admin(Some(&user.email), user.is_admin) {
        return Err(AppError::Forbidden("Only your testing partner can review this proof".to_string()));
    }

    let now = OffsetDateTime::now_utc();
    let new_status = if payload.status == "approved" { "approved" } else { "rejected" };

    let mut proof_act: proofs::ActiveModel = proof.clone().into();
    proof_act.status = Set(new_status.to_string());
    proof_act.rejection_reason = Set(if new_status == "rejected" { payload.rejection_reason.clone() } else { None });
    proof_act.reviewed_at = Set(Some(now));
    let updated = proof_act.update(&state.db).await?;

    let is_user1_uploader = proof.uploader_id == match_row.user1_id;

    // 1. Update match approval count and last activity
    let mut match_act: matches::ActiveModel = match_row.clone().into();
    let u1_appr = if is_user1_uploader {
        if new_status == "approved" { match_row.user1_approved_count + 1 } else { match_row.user1_approved_count }
    } else {
        match_row.user1_approved_count
    };
    let u2_appr = if !is_user1_uploader {
        if new_status == "approved" { match_row.user2_approved_count + 1 } else { match_row.user2_approved_count }
    } else {
        match_row.user2_approved_count
    };

    match_act.user1_approved_count = Set(u1_appr);
    match_act.user2_approved_count = Set(u2_appr);
    match_act.last_activity = Set(now);
    match_act.updated_at = Set(now);

    // 2. Adjust reputation: +1 for approved, -5 for rejected (minimum 0)
    if let Some(uploader) = Users::find_by_id(&proof.uploader_id).one(&state.db).await? {
        let mut uploader_act: users::ActiveModel = uploader.clone().into();
        let new_rep = if new_status == "approved" {
            uploader.reputation + 1
        } else {
            std::cmp::max(0, uploader.reputation - 5)
        };
        uploader_act.reputation = Set(new_rep);
        uploader_act.updated_at = Set(now);
        let _ = uploader_act.update(&state.db).await;
    }

    // 3. Match completion check & +20 reputation reward (parity with TS proof.service.ts)
    if new_status == "approved" {
        let all_proofs = Proofs::find()
            .filter(proofs::Column::MatchId.eq(&proof.match_id))
            .all(&state.db)
            .await
            .unwrap_or_default();

        let match_start = match_row.start_date.unwrap_or(match_row.created_at);
        let fourteen_days_elapsed = (now - match_start).whole_days() >= 14;

        let user1_reached_day14 = if is_user1_uploader {
            proof.day >= 14
        } else {
            all_proofs.iter().any(|p| p.uploader_id == match_row.user1_id && p.day >= 14)
        };

        let user2_reached_day14 = if !is_user1_uploader {
            proof.day >= 14
        } else {
            all_proofs.iter().any(|p| p.uploader_id == match_row.user2_id && p.day >= 14)
        };

        let has_other_pending = all_proofs.iter().any(|p| p.id != proof.id && p.status == "pending");

        let both_14_approved = u1_appr >= 14 && u2_appr >= 14;
        let cycle_concluded = !has_other_pending && (fourteen_days_elapsed || (user1_reached_day14 && user2_reached_day14));
        let both_completed = both_14_approved || cycle_concluded;

        if both_completed && match_row.status != "completed" {
            match_act.status = Set("completed".to_string());
            match_act.completed_at = Set(Some(now));

            // Reward +20 reputation to both users
            if let Some(u1) = Users::find_by_id(&match_row.user1_id).one(&state.db).await? {
                let mut u1_act: users::ActiveModel = u1.into();
                u1_act.reputation = Set(u1_act.reputation.as_ref() + 20);
                u1_act.updated_at = Set(now);
                let _ = u1_act.update(&state.db).await;
            }
            if let Some(u2) = Users::find_by_id(&match_row.user2_id).one(&state.db).await? {
                let mut u2_act: users::ActiveModel = u2.into();
                u2_act.reputation = Set(u2_act.reputation.as_ref() + 20);
                u2_act.updated_at = Set(now);
                let _ = u2_act.update(&state.db).await;
            }
        }
    }
    let _ = match_act.update(&state.db).await;

    // 4. Notify uploader about review outcome
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

    let notif_act = notifications::ActiveModel {
        id: Set(notif_id),
        user_id: Set(proof.uploader_id.clone()),
        r#type: Set(notif_type.to_string()),
        title: Set(notif_title.to_string()),
        body: Set(notif_body.clone()),
        data: Set(notif_data.clone()),
        read: Set(false),
        created_at: Set(now),
    };
    let _ = notif_act.insert(&state.db).await;

    // Send push notification to uploader
    if let Ok(Some(uploader_user)) = Users::find_by_id(&proof.uploader_id).one(&state.db).await {
        if let Some(push_token) = uploader_user.push_token {
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
    }

    Ok(Json(updated.into()))
}

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/api/proofs", post(submit_proof))
        .route("/api/proofs/match/{match_id}", get(list_match_proofs))
        .route("/api/proofs/{id}/review", post(review_proof))
}
