use axum::{extract::State, routing::post, Json, Router};
use s3::creds::Credentials;
use s3::{Bucket, Region};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

use crate::auth::AuthUser;
use crate::error::AppError;
use crate::state::AppState;

#[derive(Deserialize)]
pub struct PresignedUploadRequest {
    pub filename: String,
    #[serde(rename = "contentType")]
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
    State(state): State<AppState>,
    _auth_user: AuthUser,
    Json(payload): Json<PresignedUploadRequest>,
) -> Result<Json<PresignedUploadResponse>, AppError> {
    let extension = payload
        .filename
        .rsplit('.')
        .next()
        .unwrap_or("bin");

    let unique_key = format!("{}/{}.{}", payload.folder, Uuid::new_v4(), extension);
    let public_base_url = &state.config.r2_public_url;
    let public_url = format!("{}/{}", public_base_url.trim_end_matches('/'), unique_key);

    // If Cloudflare R2 credentials are provided, generate authentic presigned PUT URL
    let upload_url = if let (Some(access_key), Some(secret_key), Some(account_id)) = (
        &state.config.r2_access_key_id,
        &state.config.r2_secret_access_key,
        &state.config.r2_account_id,
    ) {
        let endpoint = format!("https://{}.r2.cloudflarestorage.com", account_id);
        let region = Region::Custom {
            region: "auto".to_string(),
            endpoint,
        };
        let credentials = Credentials::new(
            Some(access_key),
            Some(secret_key),
            None,
            None,
            None,
        ).map_err(|e| AppError::Internal(format!("Invalid R2 credentials: {}", e)))?;

        let bucket = Bucket::new(&state.config.r2_bucket_name, region, credentials)
            .map_err(|e| AppError::Internal(format!("Failed to initialize R2 bucket: {}", e)))?;

        // URL expires in 15 minutes (900 seconds) matching TypeScript backend
        let mut custom_headers = axum::http::HeaderMap::new();
        if let Ok(val) = axum::http::HeaderValue::from_str(&payload.content_type) {
            custom_headers.insert(axum::http::header::CONTENT_TYPE, val);
        }

        bucket
            .presign_put(&unique_key, 900, Some(custom_headers), None)
            .await
            .unwrap_or_else(|_| format!("{}/upload/{}", public_base_url.trim_end_matches('/'), unique_key))
    } else {
        format!("{}/upload/{}", public_base_url.trim_end_matches('/'), unique_key)
    };

    Ok(Json(PresignedUploadResponse {
        upload_url,
        public_url,
        key: unique_key,
    }))
}

pub fn router() -> Router<AppState> {
    Router::new().route("/api/storage/presigned-url", post(get_presigned_url))
}
