use axum::{routing::get, Json, Router};
use serde::Serialize;
use crate::state::AppState;

#[derive(Serialize)]
pub struct HealthResponse {
    pub status: &'static str,
    pub service: &'static str,
    pub version: &'static str,
}

pub async fn health_check() -> Json<HealthResponse> {
    Json(HealthResponse {
        status: "ok",
        service: "theclosedtest-backend-rs",
        version: env!("CARGO_PKG_VERSION"),
    })
}

pub fn router() -> Router<AppState> {
    Router::new().route("/health", get(health_check))
}
