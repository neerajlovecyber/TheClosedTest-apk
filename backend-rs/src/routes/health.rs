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
    #[serde(rename = "cpuPercent")]
    pub cpu_percent: f64,
    pub timestamp: String,
}

/// Read process RSS memory in MB from /proc/self/status (Linux only)
fn read_memory_mb() -> f64 {
    std::fs::read_to_string("/proc/self/status")
        .ok()
        .and_then(|s| {
            s.lines()
                .find(|l| l.starts_with("VmRSS:"))
                .and_then(|l| l.split_whitespace().nth(1))
                .and_then(|v| v.parse::<f64>().ok())
        })
        .map(|kb| (kb / 1024.0 * 10.0).round() / 10.0)
        .unwrap_or(0.0)
}

/// Sample process CPU usage over ~200ms using /proc/self/stat
async fn sample_cpu_percent() -> f64 {
    fn read_proc_ticks() -> Option<(u64, u64)> {
        let stat  = std::fs::read_to_string("/proc/self/stat").ok()?;
        let total = std::fs::read_to_string("/proc/stat").ok()?;
        let fields: Vec<&str> = stat.split_whitespace().collect();
        let utime: u64 = fields.get(13)?.parse().ok()?;
        let stime: u64 = fields.get(14)?.parse().ok()?;
        let proc_ticks = utime + stime;
        let cpu_total: u64 = total.lines().next()?
            .split_whitespace().skip(1)
            .filter_map(|v| v.parse::<u64>().ok())
            .sum();
        Some((proc_ticks, cpu_total))
    }

    let Some((pt1, ct1)) = read_proc_ticks() else { return 0.0 };
    tokio::time::sleep(std::time::Duration::from_millis(200)).await;
    let Some((pt2, ct2)) = read_proc_ticks() else { return 0.0 };

    let d_proc = pt2.saturating_sub(pt1) as f64;
    let d_cpu  = ct2.saturating_sub(ct1) as f64;
    if d_cpu == 0.0 { return 0.0; }
    (d_proc / d_cpu * 100.0 * 10.0).round() / 10.0
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
    let ping_fut = tokio::time::timeout(
        std::time::Duration::from_millis(500),
        sqlx::query("SELECT 1").execute(&state.pool),
    );
    let db_status = match ping_fut.await {
        Ok(Ok(_)) => "connected".to_string(),
        _ => {
            return Err((
                StatusCode::SERVICE_UNAVAILABLE,
                Json(serde_json::json!({ "message": "Database disconnected" })),
            ));
        }
    };

    let latency_ms = (start.elapsed().as_secs_f64() * 1000.0 * 100.0).round() / 100.0;
    let uptime = get_start_time().elapsed().as_secs();
    let now_str = OffsetDateTime::now_utc().format(&Rfc3339).unwrap_or_default();
    let memory_usage_mb = read_memory_mb();
    let cpu_percent = sample_cpu_percent().await;

    Ok(Json(HealthResponse {
        status: "healthy",
        database: db_status,
        latency_ms,
        uptime_seconds: uptime,
        memory_usage_mb,
        cpu_percent,
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

