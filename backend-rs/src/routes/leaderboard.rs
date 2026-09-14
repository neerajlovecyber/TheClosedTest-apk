use axum::{
    extract::{Query, State},
    routing::get,
    Json, Router,
};
use sea_orm::{EntityTrait, QueryOrder, QuerySelect};
use serde::{Deserialize, Serialize};

use crate::entities::prelude::*;
use crate::entities::users;
use crate::error::AppError;
use crate::state::AppState;

#[derive(Deserialize)]
pub struct LeaderboardQuery {
    pub limit: Option<u64>,
}

#[derive(Serialize, Deserialize, Clone)]
pub struct LeaderboardUserSummary {
    pub name: String,
    #[serde(rename = "avatarUrl")]
    pub avatar_url: Option<String>,
    pub reputation: i32,
    pub streak: i32,
}

#[derive(Serialize, Deserialize, Clone)]
pub struct LeaderboardItem {
    pub id: String,
    #[serde(rename = "userId")]
    pub user_id: String,
    #[serde(rename = "appId")]
    pub app_id: Option<String>,
    #[serde(rename = "boostScore")]
    pub boost_score: i32,
    pub user: Option<LeaderboardUserSummary>,
}

#[derive(Serialize, Deserialize, Clone)]
pub struct LeaderboardResponse {
    pub leaderboard: Vec<LeaderboardItem>,
    #[serde(rename = "cycleEnd")]
    pub cycle_end: Option<String>,
}

// GET /api/leaderboard
async fn get_leaderboard(
    State(state): State<AppState>,
    Query(params): Query<LeaderboardQuery>,
) -> Result<Json<LeaderboardResponse>, AppError> {
    let limit = params.limit.unwrap_or(20).clamp(1, 50);
    let cache_key = format!("leaderboard:limit:{}", limit);

    // 1. Return from in-memory RAM cache if present
    if let Some(cached_val) = state.api_cache.get(&cache_key).await {
        if let Ok(cached_res) = serde_json::from_value::<LeaderboardResponse>(cached_val) {
            return Ok(Json(cached_res));
        }
    }

    // 2. Fetch top users by reputation and streak
    let top_users = Users::find()
        .order_by_desc(users::Column::Reputation)
        .order_by_desc(users::Column::Streak)
        .limit(limit)
        .all(&state.db)
        .await?;

    let leaderboard = top_users
        .into_iter()
        .map(|u| LeaderboardItem {
            id: u.id.clone(),
            user_id: u.id,
            app_id: None,
            boost_score: u.reputation * 10 + u.streak * 5,
            user: Some(LeaderboardUserSummary {
                name: u.name,
                avatar_url: u.avatar_url,
                reputation: u.reputation,
                streak: u.streak,
            }),
        })
        .collect();

    let response = LeaderboardResponse {
        leaderboard,
        cycle_end: None,
    };

    // Store in RAM cache
    if let Ok(json_val) = serde_json::to_value(&response) {
        state.api_cache.insert(cache_key, json_val).await;
    }

    Ok(Json(response))
}

pub fn router() -> Router<AppState> {
    Router::new().route("/api/leaderboard", get(get_leaderboard))
}
