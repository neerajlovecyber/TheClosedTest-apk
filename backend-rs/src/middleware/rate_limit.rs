use axum::{
    extract::{Request, State},
    http::{header::HeaderName, HeaderValue, StatusCode},
    middleware::Next,
    response::{IntoResponse, Response},
    Json,
};
use serde_json::json;
use std::sync::atomic::{AtomicU32, Ordering};
use std::sync::Arc;
use std::time::SystemTime;

use crate::state::AppState;

fn extract_client_ip(req: &Request) -> String {
    if let Some(cf_ip) = req.headers().get("cf-connecting-ip") {
        if let Ok(s) = cf_ip.to_str() {
            let trimmed = s.trim();
            if !trimmed.is_empty() {
                return trimmed.to_string();
            }
        }
    }

    if let Some(real_ip) = req.headers().get("x-real-ip") {
        if let Ok(s) = real_ip.to_str() {
            let trimmed = s.trim();
            if !trimmed.is_empty() {
                return trimmed.to_string();
            }
        }
    }

    if let Some(forwarded_for) = req.headers().get("x-forwarded-for") {
        if let Ok(s) = forwarded_for.to_str() {
            if let Some(first_ip) = s.split(',').next() {
                let trimmed = first_ip.trim();
                if !trimmed.is_empty() {
                    return trimmed.to_string();
                }
            }
        }
    }

    "127.0.0.1".to_string()
}

pub async fn rate_limiter_middleware(
    State(state): State<AppState>,
    req: Request,
    next: Next,
) -> Response {
    let path = req.uri().path();

    // Skip rate limiting for health check, metrics, or if disabled
    if !state.config.rate_limit_enabled || path.starts_with("/api/health") || path == "/health" {
        return next.run(req).await;
    }

    let ip = extract_client_ip(&req);
    let now = SystemTime::now()
        .duration_since(SystemTime::UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs();

    let minute_bucket = now / 60;
    let reset_seconds = 60 - (now % 60);
    let key = format!("{}:{}", ip, minute_bucket);

    let atom = match state.rate_limiter.get(&key).await {
        Some(existing) => existing,
        None => {
            let new_atom = Arc::new(AtomicU32::new(0));
            state.rate_limiter.insert(key.clone(), new_atom.clone()).await;
            new_atom
        }
    };

    let count = atom.fetch_add(1, Ordering::Relaxed) + 1;
    let limit = state.config.rate_limit_per_minute;

    if count > limit {
        tracing::warn!("⚠️ Rate limit exceeded for IP {}: {}/{}", ip, count, limit);
        let body = json!({
            "error": "Too Many Requests",
            "message": "Rate limit exceeded. Please try again later."
        });

        let mut response = (StatusCode::TOO_MANY_REQUESTS, Json(body)).into_response();
        let headers = response.headers_mut();
        headers.insert(
            HeaderName::from_static("retry-after"),
            HeaderValue::from_str(&reset_seconds.to_string()).unwrap_or(HeaderValue::from_static("60")),
        );
        headers.insert(
            HeaderName::from_static("x-ratelimit-limit"),
            HeaderValue::from_str(&limit.to_string()).unwrap_or(HeaderValue::from_static("300")),
        );
        headers.insert(
            HeaderName::from_static("x-ratelimit-remaining"),
            HeaderValue::from_static("0"),
        );
        headers.insert(
            HeaderName::from_static("x-ratelimit-reset"),
            HeaderValue::from_str(&reset_seconds.to_string()).unwrap_or(HeaderValue::from_static("60")),
        );

        return response;
    }

    let remaining = limit.saturating_sub(count);
    let mut response = next.run(req).await;
    let headers = response.headers_mut();

    headers.insert(
        HeaderName::from_static("x-ratelimit-limit"),
        HeaderValue::from_str(&limit.to_string()).unwrap_or(HeaderValue::from_static("300")),
    );
    headers.insert(
        HeaderName::from_static("x-ratelimit-remaining"),
        HeaderValue::from_str(&remaining.to_string()).unwrap_or(HeaderValue::from_static("0")),
    );
    headers.insert(
        HeaderName::from_static("x-ratelimit-reset"),
        HeaderValue::from_str(&reset_seconds.to_string()).unwrap_or(HeaderValue::from_static("60")),
    );

    response
}
