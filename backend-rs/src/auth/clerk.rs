use serde::Deserialize;

#[derive(Debug, Clone, Deserialize)]
pub struct ClerkClaims {
    pub sub: String,
    pub email: Option<String>,
    pub primary_email_address: Option<String>,
}

pub struct TokenPayload {
    pub sub: String,
    pub email: Option<String>,
}

/// Verifies or decodes a raw Bearer token from Clerk
pub async fn verify_token_payload(raw_token: &str, app_env: &str) -> Option<TokenPayload> {
    // 1. Fixture tokens for test environment
    if (app_env == "test" || app_env == "development") && raw_token.starts_with("test-clerk-") {
        return Some(TokenPayload {
            sub: raw_token.to_string(),
            email: Some(format!("{}@example.com", raw_token)),
        });
    }

    if !raw_token.starts_with("ey") || !raw_token.contains('.') {
        return None;
    }

    // 2. Decode claims (insecure_decode or validated)
    // Clerk tokens are standard JWTs with `sub` being the user ID
    let mut parts = raw_token.split('.');
    let _header = parts.next()?;
    let payload_b64 = parts.next()?;

    // Standard base64 URL decode
    use base64::prelude::*;
    let decoded_bytes = BASE64_URL_SAFE_NO_PAD.decode(payload_b64).ok()?;
    let claims: ClerkClaims = serde_json::from_slice(&decoded_bytes).ok()?;

    let email = claims.email.or(claims.primary_email_address);

    Some(TokenPayload {
        sub: claims.sub,
        email,
    })
}
