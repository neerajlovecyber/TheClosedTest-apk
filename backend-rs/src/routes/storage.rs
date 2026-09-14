use axum::{routing::post, Json, Router};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

use crate::auth::AuthUser;
use crate::error::AppError;
use crate::state::AppState;

#[derive(Deserialize)]
pub struct PresignedUploadRequest {
    pub filename: String,
    #[serde(rename = "contentType")]
    #[allow(dead_code)]
    pub content_type: String,
    #[serde(default = "default_folder")]
    pub folder: String,
}

fn default_folder() -> String {
    "proofs".to_string()
}

#[derive(Serialize)]
pub struct PresignedUploadResponse {
    #[serde(rename = "uploadUrl")]
    pub upload_url: String,
    #[serde(rename = "publicUrl")]
    pub public_url: String,
    pub key: String,
}

// POST /api/storage/presigned-url
async fn get_presigned_url(
    _auth_user: AuthUser,
    Json(payload): Json<PresignedUploadRequest>,
) -> Result<Json<PresignedUploadResponse>, AppError> {
    let extension = payload
        .filename
        .rsplit('.')
        .next()
        .unwrap_or("bin");

    let unique_key = format!("{}/{}.{}", payload.folder, Uuid::new_v4(), extension);
    let public_base_url = "https://assets.theclosedtest.com";
    let public_url = format!("{}/{}", public_base_url, unique_key);
    let upload_url = format!("{}/upload/{}", public_base_url, unique_key);

    Ok(Json(PresignedUploadResponse {
        upload_url,
        public_url,
        key: unique_key,
    }))
}

pub fn router() -> Router<AppState> {
    Router::new().route("/api/storage/presigned-url", post(get_presigned_url))
}
