use axum::{
    extract::{Path, Query, State},
    routing::{get, post},
    Json, Router,
};
use serde::{Deserialize, Serialize};
use time::format_description::well_known::Rfc3339;
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
    pub app1_id: Option<String>,
    #[serde(rename = "myAppId")]
    pub my_app_id: Option<String>,
    #[serde(rename = "targetAppId")]
    pub target_app_id: Option<String>,
    #[serde(rename = "app2Id")]
    pub app2_id: Option<String>,
}

#[derive(Serialize, Clone)]
pub struct MatchAppSummary {
    pub id: String,
    pub title: String,
    #[serde(rename = "packageName")]
    pub package_name: String,
    #[serde(rename = "playStoreUrl")]
    pub play_store_url: Option<String>,
    #[serde(rename = "iconUrl")]
    pub icon_url: String,
}

#[derive(Serialize, Clone)]
pub struct MatchUserSummary {
    pub id: String,
    pub name: String,
    pub email: String,
    #[serde(rename = "avatarUrl")]
    pub avatar_url: Option<String>,
}

use std::collections::HashMap;
use sea_orm::{ColumnTrait, EntityTrait, LoaderTrait, ModelTrait, QueryFilter, QueryOrder};
use crate::entities::prelude::*;
use crate::entities::{apps, matches, messages, proofs, users};

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
    #[serde(rename = "hasUnreadMessages")]
    pub has_unread_messages: bool,
    #[serde(rename = "latestMessage")]
    pub latest_message: Option<serde_json::Value>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub proofs: Option<Vec<crate::routes::proofs::ProofResponse>>,
    #[serde(rename = "createdAt")]
    pub created_at: String,
    #[serde(rename = "match")]
    pub r#match: Option<MatchRecordSummary>,
    pub match_obj: Option<MatchRecordSummary>,
    #[serde(rename = "isUser1")]
    pub is_user1: bool,
    #[serde(rename = "myApp")]
    pub my_app: Option<MatchAppSummary>,
    #[serde(rename = "partnerApp")]
    pub partner_app: Option<MatchAppSummary>,
    #[serde(rename = "partnerUser")]
    pub partner_user: Option<MatchUserSummary>,
    pub app1: Option<MatchAppSummary>,
    pub app2: Option<MatchAppSummary>,
    pub user1: Option<MatchUserSummary>,
    pub user2: Option<MatchUserSummary>,
}

#[derive(Serialize, Clone)]
pub struct MatchRecordSummary {
    pub id: String,
}

// GET /api/matches
async fn list_matches(
    State(state): State<AppState>,
    AuthUser(user): AuthUser,
    Query(params): Query<ListMatchesQuery>,
) -> Result<Json<Vec<MatchDetailResponse>>, AppError> {
    let status_filter = params.status.as_deref().filter(|s| *s != "all");
    let is_completed = status_filter == Some("completed");

    let mut query = Matches::find()
        .order_by_desc(matches::Column::LastActivity);

    if let Some(ref tid) = user.token_identifier {
        query = query.filter(
            sea_orm::Condition::any()
                .add(matches::Column::User1Id.eq(&user.id))
                .add(matches::Column::User2Id.eq(&user.id))
                .add(matches::Column::User1Id.eq(tid))
                .add(matches::Column::User2Id.eq(tid))
        );
    } else {
        query = query.filter(
            sea_orm::Condition::any()
                .add(matches::Column::User1Id.eq(&user.id))
                .add(matches::Column::User2Id.eq(&user.id))
        );
    }

    if let Some(status) = status_filter {
        if is_completed {
            query = query.filter(matches::Column::Status.is_in(["completed", "archived"]));
        } else {
            query = query.filter(matches::Column::Status.eq(status));
        }
    }

    let matches_list: Vec<matches::Model> = query.all(&state.db).await?;
    if matches_list.is_empty() {
        return Ok(Json(Vec::new()));
    }

    let match_proofs: Vec<Vec<proofs::Model>> = matches_list.load_many(Proofs, &state.db).await?;
    let match_messages: Vec<Vec<messages::Model>> = matches_list.load_many(Messages, &state.db).await?;

    let mut app_ids = Vec::new();
    let mut user_ids = Vec::new();
    for m in &matches_list {
        app_ids.push(m.app1_id.clone());
        app_ids.push(m.app2_id.clone());
        user_ids.push(m.user1_id.clone());
        user_ids.push(m.user2_id.clone());
    }
    app_ids.sort();
    app_ids.dedup();
    user_ids.sort();
    user_ids.dedup();

    let apps_map: HashMap<String, apps::Model> = Apps::find()
        .filter(apps::Column::Id.is_in(app_ids))
        .all(&state.db)
        .await?
        .into_iter()
        .map(|a| (a.id.clone(), a))
        .collect();

    let users_map: HashMap<String, users::Model> = Users::find()
        .filter(users::Column::Id.is_in(user_ids))
        .all(&state.db)
        .await?
        .into_iter()
        .map(|u| (u.id.clone(), u))
        .collect();

    let mut results = Vec::with_capacity(matches_list.len());
    for (i, m) in matches_list.into_iter().enumerate() {
        let mut proofs_for_match = match_proofs.get(i).cloned().unwrap_or_default();
        proofs_for_match.sort_by(|a, b| b.day.cmp(&a.day).then_with(|| b.submitted_at.cmp(&a.submitted_at)));

        let u1_proof = proofs_for_match.iter().find(|p| p.uploader_id == m.user1_id);
        let u2_proof = proofs_for_match.iter().find(|p| p.uploader_id == m.user2_id);

        let user1_last_proof = u1_proof.map(|p| serde_json::json!({
            "day": p.day,
            "status": p.status,
            "updatedAt": p.submitted_at.format(&Rfc3339).unwrap_or_default()
        }));

        let user2_last_proof = u2_proof.map(|p| serde_json::json!({
            "day": p.day,
            "status": p.status,
            "updatedAt": p.submitted_at.format(&Rfc3339).unwrap_or_default()
        }));

        let mut msgs = match_messages.get(i).cloned().unwrap_or_default();
        msgs.sort_by(|a, b| b.sent_at.cmp(&a.sent_at));
        let latest_msg = msgs.first();

        let is_user1 = m.user1_id == user.id || user.token_identifier.as_deref().map_or(false, |tid| m.user1_id == tid);
        let my_last_read = if is_user1 { m.last_read1 } else { m.last_read2 };

        let is_msg_from_me = latest_msg.map_or(false, |msg| {
            msg.sender_id == user.id 
                || user.token_identifier.as_deref().map_or(false, |tid| msg.sender_id == tid)
                || msg.sender_id == "me"
        });

        let has_unread_messages = match (latest_msg, is_msg_from_me) {
            (Some(msg), false) => match my_last_read {
                None => true,
                Some(last_read) => msg.sent_at > last_read,
            },
            _ => false,
        };

        let latest_message = latest_msg.map(|msg| serde_json::json!({
            "content": msg.content,
            "sentAt": msg.sent_at.format(&Rfc3339).unwrap_or_default(),
            "senderId": msg.sender_id,
        }));

        let app1 = apps_map.get(&m.app1_id).map(|a| MatchAppSummary {
            id: a.id.clone(),
            title: a.title.clone(),
            package_name: a.package_name.clone(),
            play_store_url: Some(a.play_store_url.clone()),
            icon_url: a.icon_url.clone(),
        });
        let app2 = apps_map.get(&m.app2_id).map(|a| MatchAppSummary {
            id: a.id.clone(),
            title: a.title.clone(),
            package_name: a.package_name.clone(),
            play_store_url: Some(a.play_store_url.clone()),
            icon_url: a.icon_url.clone(),
        });
        let user1 = users_map.get(&m.user1_id).map(|u| MatchUserSummary {
            id: u.id.clone(),
            name: u.name.clone(),
            email: u.email.clone(),
            avatar_url: u.avatar_url.clone(),
        });
        let user2 = users_map.get(&m.user2_id).map(|u| MatchUserSummary {
            id: u.id.clone(),
            name: u.name.clone(),
            email: u.email.clone(),
            avatar_url: u.avatar_url.clone(),
        });

        let my_app = if is_user1 { app1.clone() } else { app2.clone() };
        let partner_app = if is_user1 { app2.clone() } else { app1.clone() };
        let partner_user = if is_user1 { user2.clone() } else { user1.clone() };

        results.push(MatchDetailResponse {
            id: m.id.clone(),
            user1_id: m.user1_id,
            app1_id: m.app1_id,
            user2_id: m.user2_id,
            app2_id: m.app2_id,
            status: m.status,
            start_date: m.start_date.map(|t| t.format(&Rfc3339).unwrap_or_default()),
            last_activity: m.last_activity.format(&Rfc3339).unwrap_or_default(),
            user1_approved_count: m.user1_approved_count,
            user2_approved_count: m.user2_approved_count,
            user1_last_proof,
            user2_last_proof,
            has_unread_messages,
            latest_message,
            proofs: None,
            created_at: m.created_at.format(&Rfc3339).unwrap_or_default(),
            r#match: Some(MatchRecordSummary { id: m.id.clone() }),
            match_obj: Some(MatchRecordSummary { id: m.id }),
            is_user1,
            my_app,
            partner_app,
            partner_user,
            app1,
            app2,
            user1,
            user2,
        });
    }

    Ok(Json(results))
}

// GET /api/matches/:id
async fn get_match(
    State(state): State<AppState>,
    AuthUser(user): AuthUser,
    Path(id): Path<String>,
) -> Result<Json<MatchDetailResponse>, AppError> {
    let m = Matches::find_by_id(&id)
        .one(&state.db)
        .await?
        .ok_or_else(|| AppError::NotFound("Match not found".to_string()))?;

    let is_user1 = m.user1_id == user.id || user.token_identifier.as_deref().map_or(false, |tid| m.user1_id == tid);
    let is_user2 = m.user2_id == user.id || user.token_identifier.as_deref().map_or(false, |tid| m.user2_id == tid);
    if !is_user1 && !is_user2 && !state.config.is_user_admin(Some(&user.email), user.is_admin) {
        return Err(AppError::Forbidden("Forbidden: Not a participant of this match".to_string()));
    }

    let mut proofs_models = m.find_related(Proofs).all(&state.db).await?;
    proofs_models.sort_by(|a, b| b.day.cmp(&a.day).then_with(|| b.submitted_at.cmp(&a.submitted_at)));

    let u1_proof = proofs_models.iter().find(|p| p.uploader_id == m.user1_id);
    let u2_proof = proofs_models.iter().find(|p| p.uploader_id == m.user2_id);

    let user1_last_proof = u1_proof.map(|p| serde_json::json!({
        "day": p.day,
        "status": p.status,
        "updatedAt": p.submitted_at.format(&Rfc3339).unwrap_or_default()
    }));

    let user2_last_proof = u2_proof.map(|p| serde_json::json!({
        "day": p.day,
        "status": p.status,
        "updatedAt": p.submitted_at.format(&Rfc3339).unwrap_or_default()
    }));

    let proof_responses: Vec<crate::routes::proofs::ProofResponse> = proofs_models
        .into_iter()
        .map(|p| crate::routes::proofs::ProofResponse {
            id: p.id,
            match_id: p.match_id,
            uploader_id: p.uploader_id,
            day: p.day,
            r#type: p.r#type,
            storage_urls: if let Some(arr) = p.storage_urls.as_array() {
                arr.iter().filter_map(|v| v.as_str().map(String::from)).collect()
            } else {
                Vec::new()
            },
            status: p.status,
            comment: p.comment,
            rejection_reason: p.rejection_reason,
            submitted_at: p.submitted_at.format(&Rfc3339).unwrap_or_default(),
            reviewed_at: p.reviewed_at.map(|t| t.format(&Rfc3339).unwrap_or_default()),
        })
        .collect();

    let latest_msg = m.find_related(Messages)
        .order_by_desc(messages::Column::SentAt)
        .one(&state.db)
        .await?;

    let my_last_read = if is_user1 { m.last_read1 } else { m.last_read2 };
    let is_msg_from_me = latest_msg.as_ref().map_or(false, |msg| {
        msg.sender_id == user.id 
            || user.token_identifier.as_deref().map_or(false, |tid| msg.sender_id == tid)
            || msg.sender_id == "me"
    });

    let has_unread_messages = match (&latest_msg, is_msg_from_me) {
        (Some(msg), false) => match my_last_read {
            None => true,
            Some(last_read) => msg.sent_at > last_read,
        },
        _ => false,
    };

    let latest_message = latest_msg.map(|msg| serde_json::json!({
        "content": msg.content,
        "sentAt": msg.sent_at.format(&Rfc3339).unwrap_or_default(),
        "senderId": msg.sender_id,
    }));

    let app1_model = Apps::find_by_id(&m.app1_id).one(&state.db).await?;
    let app2_model = Apps::find_by_id(&m.app2_id).one(&state.db).await?;
    let user1_model = Users::find_by_id(&m.user1_id).one(&state.db).await?;
    let user2_model = Users::find_by_id(&m.user2_id).one(&state.db).await?;

    let app1 = app1_model.map(|a| MatchAppSummary {
        id: a.id,
        title: a.title,
        package_name: a.package_name,
        play_store_url: Some(a.play_store_url),
        icon_url: a.icon_url,
    });
    let app2 = app2_model.map(|a| MatchAppSummary {
        id: a.id,
        title: a.title,
        package_name: a.package_name,
        play_store_url: Some(a.play_store_url),
        icon_url: a.icon_url,
    });
    let user1 = user1_model.map(|u| MatchUserSummary {
        id: u.id,
        name: u.name,
        email: u.email,
        avatar_url: u.avatar_url,
    });
    let user2 = user2_model.map(|u| MatchUserSummary {
        id: u.id,
        name: u.name,
        email: u.email,
        avatar_url: u.avatar_url,
    });

    let my_app = if is_user1 { app1.clone() } else { app2.clone() };
    let partner_app = if is_user1 { app2.clone() } else { app1.clone() };
    let partner_user = if is_user1 { user2.clone() } else { user1.clone() };

    Ok(Json(MatchDetailResponse {
        id: m.id.clone(),
        user1_id: m.user1_id,
        app1_id: m.app1_id,
        user2_id: m.user2_id,
        app2_id: m.app2_id,
        status: m.status,
        start_date: m.start_date.map(|t| t.format(&Rfc3339).unwrap_or_default()),
        last_activity: m.last_activity.format(&Rfc3339).unwrap_or_default(),
        user1_approved_count: m.user1_approved_count,
        user2_approved_count: m.user2_approved_count,
        user1_last_proof,
        user2_last_proof,
        has_unread_messages,
        latest_message,
        proofs: Some(proof_responses),
        created_at: m.created_at.format(&Rfc3339).unwrap_or_default(),
        r#match: Some(MatchRecordSummary { id: m.id.clone() }),
        match_obj: Some(MatchRecordSummary { id: m.id }),
        is_user1,
        my_app,
        partner_app,
        partner_user,
        app1,
        app2,
        user1,
        user2,
    }))
}

// POST /api/matches/request
async fn request_match(
    State(state): State<AppState>,
    AuthUser(user): AuthUser,
    Json(payload): Json<RequestMatchRequest>,
) -> Result<Json<MatchRecord>, AppError> {
    let app1_id = payload.app1_id.or(payload.my_app_id).ok_or_else(|| {
        AppError::BadRequest("App 1 ID (app1Id or myAppId) is required".to_string())
    })?;

    let target_app_id = payload.target_app_id.or(payload.app2_id).ok_or_else(|| {
        AppError::BadRequest("Target App ID (targetAppId or app2Id) is required".to_string())
    })?;

    // Self-match check
    if app1_id == target_app_id {
        return Err(AppError::BadRequest("Cannot request a match with your own app".to_string()));
    }

    // 1. Verify app1 belongs to user
    let app1: (String, String, String, String, i32) = sqlx::query_as(
        "SELECT id, user_id, status, title, required_testers FROM apps WHERE id = $1",
    )
    .bind(&app1_id)
    .fetch_optional(&state.pool)
    .await
    .map_err(AppError::Database)?
    .ok_or_else(|| AppError::BadRequest("Your selected app was not found".to_string()))?;

    if app1.1 != user.id {
        return Err(AppError::Forbidden("You do not own the app you are requesting swap with".to_string()));
    }

    // 2. Verify target app
    let app2: (String, String, String, String, i32) = sqlx::query_as(
        "SELECT id, user_id, status, title, required_testers FROM apps WHERE id = $1",
    )
    .bind(&target_app_id)
    .fetch_optional(&state.pool)
    .await
    .map_err(AppError::Database)?
    .ok_or_else(|| AppError::BadRequest("Target app not found".to_string()))?;

    if app2.1 == user.id {
        return Err(AppError::BadRequest("Cannot request a match with your own app".to_string()));
    }

    if app2.2 == "paused" {
        return Err(AppError::BadRequest(
            "Target app is currently paused and cannot accept new test swaps right now.".to_string(),
        ));
    }

    // 3. Verify neither app has reached required testers limit
    let count1: (i64,) = sqlx::query_as(
        "SELECT COUNT(*) FROM matches WHERE (app1_id = $1 OR app2_id = $1) AND status NOT IN ('rejected', 'cancelled')",
    )
    .bind(&app1_id)
    .fetch_one(&state.pool)
    .await
    .map_err(AppError::Database)?;

    if count1.0 >= app1.4 as i64 {
        return Err(AppError::BadRequest(format!(
            "Cannot request swap: Your app \"{}\" has reached full tester capacity ({}/{})",
            app1.3, count1.0, app1.4
        )));
    }

    let count2: (i64,) = sqlx::query_as(
        "SELECT COUNT(*) FROM matches WHERE (app1_id = $1 OR app2_id = $1) AND status NOT IN ('rejected', 'cancelled')",
    )
    .bind(&target_app_id)
    .fetch_one(&state.pool)
    .await
    .map_err(AppError::Database)?;

    if count2.0 >= app2.4 as i64 {
        return Err(AppError::BadRequest(format!(
            "Cannot request swap: \"{}\" has reached full tester capacity ({}/{})",
            app2.3, count2.0, app2.4
        )));
    }

    // 4. Verify no existing pending or active match
    let existing: Option<(String,)> = sqlx::query_as(
        r#"
        SELECT id FROM matches
        WHERE ((app1_id = $1 AND app2_id = $2) OR (app1_id = $2 AND app2_id = $1))
          AND status IN ('pending', 'active')
        "#,
    )
    .bind(&app1_id)
    .bind(&target_app_id)
    .fetch_optional(&state.pool)
    .await
    .map_err(AppError::Database)?;

    if existing.is_some() {
        return Err(AppError::BadRequest("A match request or active test already exists between these apps".to_string()));
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
    .bind(&new_id)
    .bind(&user.id)
    .bind(&app1.0)
    .bind(&app2.1)
    .bind(&app2.0)
    .fetch_one(&state.pool)
    .await
    .map_err(AppError::Database)?;

    // 5. Notify target user asynchronously (in-app notification + push)
    let notif_id = Uuid::new_v4().to_string();
    let notif_data = serde_json::json!({
        "matchId": new_id,
        "app1Id": app1_id,
        "app2Id": target_app_id,
    });
    let notif_title = "New Testing Request!";
    let notif_body = format!("{} wants to test {} in exchange for {}.", user.name, app2.3, app1.3);
    let _ = sqlx::query(
        "INSERT INTO notifications (id, user_id, type, title, body, data, read, created_at) VALUES ($1, $2, 'request', $3, $4, $5, false, NOW())",
    )
    .bind(notif_id)
    .bind(&app2.1)
    .bind(notif_title)
    .bind(&notif_body)
    .bind(&notif_data)
    .execute(&state.pool)
    .await;

    // Send push notification if recipient has push token
    let target_push_token: Option<(Option<String>,)> = sqlx::query_as(
        "SELECT push_token FROM users WHERE id = $1",
    )
    .bind(&app2.1)
    .fetch_optional(&state.pool)
    .await
    .unwrap_or(None);

    if let Some((Some(push_token),)) = target_push_token {
        let push_client = reqwest::Client::new();
        let push_title = "New Testing Request!".to_string();
        let push_body = format!("{} requested a peer test with {}!", user.name, app2.3);
        let push_data = notif_data.clone();
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
    .bind(&notif_data)
    .execute(&state.pool)
    .await;

    // Send push notification to user1
    let user1_push_token: Option<(Option<String>,)> = sqlx::query_as(
        "SELECT push_token FROM users WHERE id = $1",
    )
    .bind(&match_row.user1_id)
    .fetch_optional(&state.pool)
    .await
    .unwrap_or(None);

    if let Some((Some(push_token),)) = user1_push_token {
        let push_client = reqwest::Client::new();
        let push_title = "Match Accepted!".to_string();
        let push_body = "Your testing exchange was accepted! Day 1 testing starts today.".to_string();
        let push_data = notif_data.clone();
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

    // Invalidate public apps list RAM cache so marketplace current_testers updates immediately
    state.api_cache.invalidate_all();

    Ok(Json(updated))
}

// POST /api/matches/:id/reject or /cancel
async fn cancel_or_reject_match(
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

    let is_part = match_row.user1_id == user.id || match_row.user2_id == user.id;
    if !is_part && !state.config.is_user_admin(Some(&user.email), user.is_admin) {
        return Err(AppError::Forbidden("You are not authorized to cancel this match".to_string()));
    }

    let updated = sqlx::query_as::<_, MatchRecord>(
        r#"
        UPDATE matches
        SET status = 'cancelled', updated_at = NOW()
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

    Ok(Json(updated))
}

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/api/matches", get(list_matches))
        .route("/api/matches/request", post(request_match))
        .route("/api/matches/{id}", get(get_match))
        .route("/api/matches/{id}/accept", post(accept_match))
        .route("/api/matches/{id}/cancel", post(cancel_or_reject_match))
        .route("/api/matches/{id}/reject", post(cancel_or_reject_match))
}
