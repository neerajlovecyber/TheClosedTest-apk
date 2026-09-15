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
use sea_orm::{ActiveModelTrait, ColumnTrait, EntityTrait, LoaderTrait, ModelTrait, PaginatorTrait, QueryFilter, QueryOrder, Set};
use time::OffsetDateTime;
use crate::entities::prelude::*;
use crate::entities::{apps, matches, messages, notifications, proofs, users};

impl From<matches::Model> for MatchRecord {
    fn from(m: matches::Model) -> Self {
        Self {
            id: m.id,
            user1_id: m.user1_id,
            app1_id: m.app1_id,
            user2_id: m.user2_id,
            app2_id: m.app2_id,
            status: m.status,
            start_date: m.start_date,
            last_activity: m.last_activity,
            last_read1: m.last_read1,
            last_read2: m.last_read2,
            completed_at: m.completed_at,
            user1_approved_count: m.user1_approved_count,
            user2_approved_count: m.user2_approved_count,
            user1_last_proof: None,
            user2_last_proof: None,
            created_at: m.created_at,
            updated_at: m.updated_at,
        }
    }
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
    #[serde(rename = "completedAt")]
    pub completed_at: Option<String>,
    #[serde(rename = "lastActivity")]
    pub last_activity: String,
    #[serde(rename = "updatedAt")]
    pub updated_at: Option<String>,
    #[serde(rename = "user1ApprovedCount")]
    pub user1_approved_count: i32,
    #[serde(rename = "user2ApprovedCount")]
    pub user2_approved_count: i32,
    #[serde(rename = "user1LastProof")]
    pub user1_last_proof: Option<serde_json::Value>,
    #[serde(rename = "user2LastProof")]
    pub user2_last_proof: Option<serde_json::Value>,
    #[serde(rename = "lastRead1")]
    pub last_read1: Option<String>,
    #[serde(rename = "lastRead2")]
    pub last_read2: Option<String>,
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
            completed_at: m.completed_at.map(|t| t.format(&Rfc3339).unwrap_or_default()),
            last_activity: m.last_activity.format(&Rfc3339).unwrap_or_default(),
            updated_at: Some(m.updated_at.format(&Rfc3339).unwrap_or_default()),
            user1_approved_count: m.user1_approved_count,
            user2_approved_count: m.user2_approved_count,
            user1_last_proof,
            user2_last_proof,
            last_read1: m.last_read1.map(|t| t.format(&Rfc3339).unwrap_or_default()),
            last_read2: m.last_read2.map(|t| t.format(&Rfc3339).unwrap_or_default()),
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
        completed_at: m.completed_at.map(|t| t.format(&Rfc3339).unwrap_or_default()),
        last_activity: m.last_activity.format(&Rfc3339).unwrap_or_default(),
        updated_at: Some(m.updated_at.format(&Rfc3339).unwrap_or_default()),
        user1_approved_count: m.user1_approved_count,
        user2_approved_count: m.user2_approved_count,
        user1_last_proof,
        user2_last_proof,
        last_read1: m.last_read1.map(|t| t.format(&Rfc3339).unwrap_or_default()),
        last_read2: m.last_read2.map(|t| t.format(&Rfc3339).unwrap_or_default()),
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
    let mut app1_id = payload.app1_id.or(payload.my_app_id);
    let target_app_id = payload.target_app_id.or(payload.app2_id).ok_or_else(|| {
        AppError::BadRequest("Target app ID (targetAppId or app2Id) is required".to_string())
    })?;

    if app1_id.is_none() {
        // Look up user's most recently created active app (parity with TS MatchService.requestMatch)
        use sea_orm::QueryOrder;
        let user_app = Apps::find()
            .filter(apps::Column::UserId.eq(&user.id))
            .filter(apps::Column::Status.ne("archived"))
            .order_by_desc(apps::Column::CreatedAt)
            .one(&state.db)
            .await?;
        if let Some(ua) = user_app {
            app1_id = Some(ua.id);
        } else {
            return Err(AppError::BadRequest("You must add at least one app before requesting a swap".to_string()));
        }
    }
    let app1_id = app1_id.unwrap();

    // Self-match check
    if app1_id == target_app_id {
        return Err(AppError::BadRequest("Cannot match with your own app".to_string()));
    }

    // 1. Verify app1 belongs to user
    let app1 = Apps::find_by_id(&app1_id)
        .one(&state.db)
        .await?
        .ok_or_else(|| AppError::BadRequest("Your selected app was not found".to_string()))?;

    if app1.user_id != user.id {
        return Err(AppError::Forbidden("You do not own the app you are requesting swap with".to_string()));
    }

    // 2. Verify target app
    let app2 = Apps::find_by_id(&target_app_id)
        .one(&state.db)
        .await?
        .ok_or_else(|| AppError::BadRequest("Target app not found".to_string()))?;

    if app2.user_id == user.id {
        return Err(AppError::BadRequest("Cannot match with your own app".to_string()));
    }

    if app1.status == "archived" || app2.status == "archived" {
        return Err(AppError::BadRequest("Cannot request match: One of the apps has been archived or deleted".to_string()));
    }

    if app2.status == "paused" {
        return Err(AppError::BadRequest(
            "Cannot request match: Target app is currently paused and not accepting new test swaps".to_string(),
        ));
    }

    if app1.status == "paused" {
        return Err(AppError::BadRequest(
            "Cannot request match: Your app is currently removed from the marketplace. Enable marketplace listing in Edit App to request swaps.".to_string(),
        ));
    }

    // 3. Verify neither app has reached required testers limit (active matches only, parity with TS)
    let count1 = Matches::find()
        .filter(
            sea_orm::Condition::all()
                .add(
                    sea_orm::Condition::any()
                        .add(matches::Column::App1Id.eq(&app1.id))
                        .add(matches::Column::App2Id.eq(&app1.id))
                )
                .add(matches::Column::Status.eq("active"))
        )
        .count(&state.db)
        .await? as i32;

    if count1 >= app1.required_testers {
        return Err(AppError::BadRequest(format!(
            "Cannot request swap: Your app \"{}\" has reached full tester capacity ({}/{})",
            app1.title, count1, app1.required_testers
        )));
    }

    let count2 = Matches::find()
        .filter(
            sea_orm::Condition::all()
                .add(
                    sea_orm::Condition::any()
                        .add(matches::Column::App1Id.eq(&app2.id))
                        .add(matches::Column::App2Id.eq(&app2.id))
                )
                .add(matches::Column::Status.eq("active"))
        )
        .count(&state.db)
        .await? as i32;

    if count2 >= app2.required_testers {
        return Err(AppError::BadRequest(format!(
            "Cannot request swap: \"{}\" has reached full tester capacity ({}/{})",
            app2.title, count2, app2.required_testers
        )));
    }

    // 4. Verify no existing pending or active match
    let existing = Matches::find()
        .filter(
            sea_orm::Condition::all()
                .add(
                    sea_orm::Condition::any()
                        .add(
                            sea_orm::Condition::all()
                                .add(matches::Column::App1Id.eq(&app1.id))
                                .add(matches::Column::App2Id.eq(&app2.id))
                        )
                        .add(
                            sea_orm::Condition::all()
                                .add(matches::Column::App1Id.eq(&app2.id))
                                .add(matches::Column::App2Id.eq(&app1.id))
                        )
                )
                .add(matches::Column::Status.is_in(["pending", "active"]))
        )
        .one(&state.db)
        .await?;

    if existing.is_some() {
        return Err(AppError::BadRequest("A match request or active test already exists between these apps".to_string()));
    }

    let new_id = Uuid::new_v4().to_string();
    let now = OffsetDateTime::now_utc();
    let match_act = matches::ActiveModel {
        id: Set(new_id.clone()),
        user1_id: Set(user.id.clone()),
        app1_id: Set(app1.id.clone()),
        user2_id: Set(app2.user_id.clone()),
        app2_id: Set(app2.id.clone()),
        status: Set("pending".to_string()),
        start_date: Set(None),
        last_activity: Set(now),
        last_read1: Set(None),
        last_read2: Set(None),
        completed_at: Set(None),
        user1_approved_count: Set(0),
        user2_approved_count: Set(0),
        created_at: Set(now),
        updated_at: Set(now),
    };
    let new_match = match_act.insert(&state.db).await?;

    // 5. Notify target user asynchronously (in-app notification + push)
    let notif_id = Uuid::new_v4().to_string();
    let notif_data = serde_json::json!({
        "matchId": new_id,
        "app1Id": app1.id,
        "app2Id": app2.id,
    });
    let notif_title = "New Testing Request!".to_string();
    let notif_body = format!("{} wants to test {} in exchange for {}.", user.name, app2.title, app1.title);
    let notif_act = notifications::ActiveModel {
        id: Set(notif_id),
        user_id: Set(app2.user_id.clone()),
        r#type: Set("request".to_string()),
        title: Set(notif_title.clone()),
        body: Set(notif_body.clone()),
        data: Set(notif_data.clone()),
        read: Set(false),
        created_at: Set(now),
    };
    let _ = notif_act.insert(&state.db).await;

    // Send push notification if recipient has push token
    if let Ok(Some(target_user)) = Users::find_by_id(&app2.user_id).one(&state.db).await {
        if let Some(push_token) = target_user.push_token {
            let push_client = reqwest::Client::new();
            let push_title = "New Testing Request!".to_string();
            let push_body = format!("{} requested a peer test with {}!", user.name, app2.title);
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

    Ok(Json(new_match.into()))
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
    let match_row = Matches::find_by_id(&id)
        .one(&state.db)
        .await?
        .ok_or_else(|| AppError::NotFound("Match not found".to_string()))?;

    if match_row.user2_id != user.id || match_row.status != "pending" {
        return Err(AppError::Forbidden("Only the target recipient can accept a pending match request".to_string()));
    }

    let app1 = Apps::find_by_id(&match_row.app1_id)
        .one(&state.db)
        .await?
        .ok_or_else(|| AppError::NotFound("Source app not found".to_string()))?;

    let app2 = Apps::find_by_id(&match_row.app2_id)
        .one(&state.db)
        .await?
        .ok_or_else(|| AppError::NotFound("Target app not found".to_string()))?;

    if app1.status == "archived" || app2.status == "archived" {
        return Err(AppError::BadRequest("Cannot accept: One of the apps has been archived or deleted".to_string()));
    }

    // Verify capacities before accepting (parity with TS match.service.ts)
    let count1 = Matches::find()
        .filter(
            sea_orm::Condition::all()
                .add(
                    sea_orm::Condition::any()
                        .add(matches::Column::App1Id.eq(&app1.id))
                        .add(matches::Column::App2Id.eq(&app1.id))
                )
                .add(matches::Column::Status.eq("active"))
        )
        .count(&state.db)
        .await? as i32;

    if count1 >= app1.required_testers {
        return Err(AppError::BadRequest(format!(
            "Cannot accept: \"{}\" has reached full tester capacity ({}/{})",
            app1.title, count1, app1.required_testers
        )));
    }

    let count2 = Matches::find()
        .filter(
            sea_orm::Condition::all()
                .add(
                    sea_orm::Condition::any()
                        .add(matches::Column::App1Id.eq(&app2.id))
                        .add(matches::Column::App2Id.eq(&app2.id))
                )
                .add(matches::Column::Status.eq("active"))
        )
        .count(&state.db)
        .await? as i32;

    if count2 >= app2.required_testers {
        return Err(AppError::BadRequest(format!(
            "Cannot accept: \"{}\" has reached full tester capacity ({}/{})",
            app2.title, count2, app2.required_testers
        )));
    }

    let now = OffsetDateTime::now_utc();
    let mut match_act: matches::ActiveModel = match_row.clone().into();
    match_act.status = Set("active".to_string());
    match_act.start_date = Set(Some(now));
    match_act.last_activity = Set(now);
    match_act.updated_at = Set(now);
    let updated = match_act.update(&state.db).await?;

    // Invalidate public apps RAM cache
    state.api_cache.invalidate_all();

    // Send in-app notification to requester (user1)
    let notif_id = Uuid::new_v4().to_string();
    let notif_data = serde_json::json!({ "matchId": id });
    let notif_act = notifications::ActiveModel {
        id: Set(notif_id),
        user_id: Set(match_row.user1_id.clone()),
        r#type: Set("acceptance".to_string()),
        title: Set("Match Accepted!".to_string()),
        body: Set("Your testing exchange was accepted! Day 1 testing starts today.".to_string()),
        data: Set(notif_data.clone()),
        read: Set(false),
        created_at: Set(now),
    };
    let _ = notif_act.insert(&state.db).await;

    // Send push notification to user1
    if let Ok(Some(user1_user)) = Users::find_by_id(&match_row.user1_id).one(&state.db).await {
        if let Some(push_token) = user1_user.push_token {
            let push_client = reqwest::Client::new();
            let push_title = "Match Accepted!".to_string();
            let push_body = "Your testing exchange was accepted! Day 1 testing starts today.".to_string();
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

// POST /api/matches/:id/reject or /cancel
async fn cancel_or_reject_match(
    State(state): State<AppState>,
    AuthUser(user): AuthUser,
    Path(id): Path<String>,
) -> Result<Json<MatchRecord>, AppError> {
    let match_row = Matches::find_by_id(&id)
        .one(&state.db)
        .await?
        .ok_or_else(|| AppError::NotFound("Match not found".to_string()))?;

    let is_part = match_row.user1_id == user.id || match_row.user2_id == user.id;
    if !is_part && !state.config.is_user_admin(Some(&user.email), user.is_admin) {
        return Err(AppError::Forbidden("You are not authorized to cancel this match".to_string()));
    }

    let now = OffsetDateTime::now_utc();
    let mut match_act: matches::ActiveModel = match_row.clone().into();
    match_act.status = Set("cancelled".to_string());
    match_act.updated_at = Set(now);
    let updated = match_act.update(&state.db).await?;

    state.api_cache.invalidate_all();

    // Notify other user
    let other_user_id = if match_row.user1_id == user.id { match_row.user2_id } else { match_row.user1_id };
    let notif_id = Uuid::new_v4().to_string();
    let notif_data = serde_json::json!({ "matchId": id });
    let notif_act = notifications::ActiveModel {
        id: Set(notif_id),
        user_id: Set(other_user_id),
        r#type: Set("match_cancelled".to_string()),
        title: Set("Testing Match Cancelled".to_string()),
        body: Set("A testing match has been cancelled.".to_string()),
        data: Set(notif_data),
        read: Set(false),
        created_at: Set(now),
    };
    let _ = notif_act.insert(&state.db).await;

    Ok(Json(updated.into()))
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
