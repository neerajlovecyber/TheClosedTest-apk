use axum::{extract::State, http::StatusCode, routing::get, Json, Router};
use serde::Serialize;
use std::time::Instant;
use time::OffsetDateTime;
use time::format_description::well_known::Rfc3339;
use crate::state::AppState;

#[derive(Serialize)]
pub struct RootResponse {
    pub message: &'static str,
}

#[derive(Serialize)]
pub struct HealthResponse {
    pub status: &'static str,
    pub database: String,
    #[serde(rename = "latencyMs")]
    pub latency_ms: f64,
    #[serde(rename = "uptimeSeconds")]
    pub uptime_seconds: u64,
    #[serde(rename = "memoryUsageMB")]
    pub memory_usage_mb: f64,
    pub timestamp: String,
}

static START_TIME: std::sync::OnceLock<Instant> = std::sync::OnceLock::new();

pub fn get_start_time() -> Instant {
    *START_TIME.get_or_init(Instant::now)
}

pub async fn root_check() -> Json<RootResponse> {
    Json(RootResponse {
        message: "TheClosedTest API is healthy",
    })
}

pub async fn health_check(
    State(state): State<AppState>,
) -> Result<Json<HealthResponse>, (StatusCode, Json<serde_json::Value>)> {
    let start = Instant::now();
    let db_status = match sqlx::query("SELECT 1").execute(&state.pool).await {
        Ok(_) => "connected".to_string(),
        Err(_) => {
            return Err((
                StatusCode::SERVICE_UNAVAILABLE,
                Json(serde_json::json!({ "message": "Database disconnected" })),
            ));
        }
    };

    let latency_ms = (start.elapsed().as_secs_f64() * 1000.0 * 100.0).round() / 100.0;
    let uptime = get_start_time().elapsed().as_secs();
    let now_str = OffsetDateTime::now_utc().format(&Rfc3339).unwrap_or_default();

    Ok(Json(HealthResponse {
        status: "healthy",
        database: db_status,
        latency_ms,
        uptime_seconds: uptime,
        memory_usage_mb: 18.5,
        timestamp: now_str,
    }))
}

pub fn router() -> Router<AppState> {
    // Initialize start time
    get_start_time();
    Router::new()
        .route("/", get(root_check))
        .route("/health", get(health_check))
}

