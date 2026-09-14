use axum::{
    extract::{Query, State},
    routing::get,
    Json, Router,
};
use serde::{Deserialize, Serialize};

use crate::error::AppError;
use crate::state::AppState;

#[derive(Deserialize)]
pub struct LeaderboardQuery {
    pub limit: Option<i64>,
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

    // 1. Return from in-memory RAM cache if present (0 DB queries, sub-millisecond response)
    if let Some(cached_val) = state.api_cache.get(&cache_key).await {
        if let Ok(cached_res) = serde_json::from_value::<LeaderboardResponse>(cached_val) {
            return Ok(Json(cached_res));
        }
    }

    // 2. Fetch top users by reputation and streak
    let top_users = sqlx::query_as::<_, (String, String, Option<String>, i32, i32)>(
        "SELECT id, name, avatar_url, reputation, streak FROM users ORDER BY reputation DESC, streak DESC LIMIT $1",
    )
    .bind(limit)
    .fetch_all(&state.pool)
    .await
    .map_err(AppError::Database)?;

    let leaderboard = top_users
        .into_iter()
        .map(|(id, name, avatar_url, reputation, streak)| LeaderboardItem {
            id: id.clone(),
            user_id: id,
            app_id: None,
            boost_score: reputation * 10 + streak * 5,
            user: Some(LeaderboardUserSummary {
                name,
                avatar_url,
                reputation,
                streak,
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
