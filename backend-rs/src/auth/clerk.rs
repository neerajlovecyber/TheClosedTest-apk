use jsonwebtoken::jwk::{AlgorithmParameters, JwkSet};
use jsonwebtoken::{decode, decode_header, DecodingKey, Validation};
use serde::Deserialize;
use tracing::warn;

use crate::state::AppState;

#[derive(Debug, Clone, Deserialize)]
pub struct ClerkClaims {
    pub sub: String,
    pub exp: Option<u64>,
    pub email: Option<String>,
    pub primary_email_address: Option<String>,
}

pub struct TokenPayload {
    pub sub: String,
    pub email: Option<String>,
}

/// Fetches or retrieves cached JWKS keyset from Clerk frontend API
async fn get_clerk_jwks(state: &AppState, force_refresh: bool) -> Option<JwkSet> {
    let domain = state.config.clerk_frontend_api
        .trim_start_matches("https://")
        .trim_start_matches("http://")
        .trim_end_matches('/');

    if !force_refresh {
        if let Some(jwks) = state.jwks_cache.get(domain).await {
            return Some(jwks);
        }
    }

    let url = format!("https://{}/.well-known/jwks.json", domain);
    let resp = state.http_client.get(&url).send().await.ok()?;
    if !resp.status().is_success() {
        return None;
    }

    let jwks: JwkSet = resp.json().await.ok()?;
    state.jwks_cache.insert(domain.to_string(), jwks.clone()).await;
    Some(jwks)
}

/// Verifies a raw Bearer token from Clerk using jsonwebtoken RS256 cryptographic signature verification.
/// In "test" environment, fixture tokens starting with "test-clerk-" or synthetic JWTs decode immediately.
pub async fn verify_token_payload(raw_token: &str, state: &AppState) -> Option<TokenPayload> {
    // 1. Fixture tokens strictly for test environment
    if state.config.app_env == "test" && (raw_token.starts_with("test-clerk-") || raw_token.starts_with("fixture_token_")) {
        return Some(TokenPayload {
            sub: raw_token.to_string(),
            email: Some(format!("{}@example.com", raw_token)),
        });
    }

    if !raw_token.starts_with("ey") || !raw_token.contains('.') {
        return None;
    }

    // 2. Decode JWT header to extract key ID (kid) and algorithm
    let header = decode_header(raw_token).ok()?;

    // 3. In test environment, allow synthetic test JWTs without remote JWKS calls
    if state.config.app_env == "test" {
        let mut parts = raw_token.split('.');
        let _header = parts.next()?;
        let payload_b64 = parts.next()?;

        use base64::prelude::*;
        let decoded_bytes = BASE64_URL_SAFE_NO_PAD.decode(payload_b64).ok()?;
        let claims: ClerkClaims = serde_json::from_slice(&decoded_bytes).ok()?;
        let email = claims.email.or(claims.primary_email_address);

        return Some(TokenPayload {
            sub: claims.sub,
            email,
        });
    }

    // 4. If CLERK_JWT_KEY PEM is provided in environment, verify directly without network call
    if let Some(ref jwt_pem) = state.config.clerk_jwt_key {
        if let Ok(decoding_key) = DecodingKey::from_rsa_pem(jwt_pem.as_bytes()) {
            let mut validation = Validation::new(header.alg);
            validation.validate_exp = true;
            validation.validate_aud = false;
            validation.set_required_spec_claims(&["sub", "exp"]);

            if let Ok(token_data) = decode::<ClerkClaims>(raw_token, &decoding_key, &validation) {
                let email = token_data.claims.email.or(token_data.claims.primary_email_address);
                return Some(TokenPayload {
                    sub: token_data.claims.sub,
                    email,
                });
            }
        }
    }

    // 5. Cryptographically verify signature against Clerk's remote JWKS (RS256)
    let mut jwks_opt = get_clerk_jwks(state, false).await;

    // Handle Clerk key rotation: if kid is not found in cached JWKS, refresh once
    if let (Some(ref jwks), Some(kid)) = (&jwks_opt, &header.kid) {
        if jwks.find(kid).is_none() {
            jwks_opt = get_clerk_jwks(state, true).await;
        }
    }

    if let Some(jwks) = jwks_opt {
        if let Some(kid) = &header.kid {
            if let Some(jwk) = jwks.find(kid) {
                if let AlgorithmParameters::RSA(ref rsa) = jwk.algorithm {
                    if let Ok(decoding_key) = DecodingKey::from_rsa_components(&rsa.n, &rsa.e) {
                        let mut validation = Validation::new(header.alg);
                        validation.validate_exp = true;
                        // Clerk tokens can omit audience or have custom issuer
                        validation.validate_aud = false;
                        validation.set_required_spec_claims(&["sub", "exp"]);

                        if let Ok(token_data) = decode::<ClerkClaims>(raw_token, &decoding_key, &validation) {
                            let email = token_data.claims.email.or(token_data.claims.primary_email_address);
                            return Some(TokenPayload {
                                sub: token_data.claims.sub,
                                email,
                            });
                        }
                    }
                }
            }
        }
    }

    // 6. Security guard: In production, reject any token that failed cryptographic verification
    if state.config.app_env == "production" {
        warn!("Cryptographic JWKS verification failed for Clerk token in production; rejecting request");
        return None;
    }

    // 7. Non-production development fallback for offline testing
    warn!("Cryptographic JWKS verification failed for Clerk token; inspecting fallback");
    let mut parts = raw_token.split('.');
    let _header = parts.next()?;
    let payload_b64 = parts.next()?;

    use base64::prelude::*;
    let decoded_bytes = BASE64_URL_SAFE_NO_PAD.decode(payload_b64).ok()?;
    let claims: ClerkClaims = serde_json::from_slice(&decoded_bytes).ok()?;
    let email = claims.email.or(claims.primary_email_address);

    Some(TokenPayload {
        sub: claims.sub,
        email,
    })
}
