use axum::{extract::State, http::StatusCode, routing::get, Json, Router};
use serde::Serialize;
use std::sync::Mutex;
use std::time::{Duration, Instant};
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

/// Cached CPU sample state: (timestamp, proc_ticks, cpu_total, last_calculated_pct)
static CPU_CACHE: Mutex<Option<(Instant, u64, u64, f64)>> = Mutex::new(None);

/// Non-blocking process CPU usage sample (Linux only, fallback 0.0)
fn sample_cpu_percent() -> f64 {
    fn read_proc_ticks() -> Option<(u64, u64)> {
        let stat = std::fs::read_to_string("/proc/self/stat").ok()?;
        let total = std::fs::read_to_string("/proc/stat").ok()?;
        let fields: Vec<&str> = stat.split_whitespace().collect();
        let utime: u64 = fields.get(13)?.parse().ok()?;
        let stime: u64 = fields.get(14)?.parse().ok()?;
        let proc_ticks = utime + stime;
        let cpu_total: u64 = total
            .lines()
            .next()?
            .split_whitespace()
            .skip(1)
            .filter_map(|v| v.parse::<u64>().ok())
            .sum();
        Some((proc_ticks, cpu_total))
    }

    let Some((proc_ticks, cpu_total)) = read_proc_ticks() else {
        return 0.0;
    };
    let now = Instant::now();

    let mut lock = match CPU_CACHE.lock() {
        Ok(guard) => guard,
        Err(poisoned) => poisoned.into_inner(),
    };

    match *lock {
        Some((last_time, last_proc, last_cpu, last_pct)) => {
            let elapsed = now.duration_since(last_time);
            if elapsed < Duration::from_millis(500) {
                last_pct
            } else {
                let d_proc = proc_ticks.saturating_sub(last_proc) as f64;
                let d_cpu = cpu_total.saturating_sub(last_cpu) as f64;
                let pct = if d_cpu > 0.0 {
                    (d_proc / d_cpu * 100.0 * 10.0).round() / 10.0
                } else {
                    0.0
                };
                *lock = Some((now, proc_ticks, cpu_total, pct));
                pct
            }
        }
        None => {
            *lock = Some((now, proc_ticks, cpu_total, 0.0));
            0.0
        }
    }
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
        std::time::Duration::from_secs(5),
        state.db.ping(),
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
    let cpu_percent = sample_cpu_percent();

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
        .route("/api/health", get(health_check))
}

