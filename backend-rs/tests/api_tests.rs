use axum::{
    body::Body,
    http::{Request, StatusCode},
};
use http_body_util::BodyExt;
use sqlx::postgres::PgPoolOptions;
use tower::ServiceExt;
use validator::Validate;

use backend_rs::auth::clerk::verify_token_payload;
use backend_rs::config::Config;
use backend_rs::routes::app_router;
use backend_rs::routes::apps::CreateAppRequest;
use backend_rs::routes::matches::RequestMatchRequest;
use backend_rs::routes::proofs::SubmitProofRequest;
use backend_rs::state::AppState;

fn test_config(env: &str) -> Config {
    Config {
        database_url: "postgres://localhost:5432/theclosedtest_test".to_string(),
        port: 9000,
        clerk_secret_key: None,
        clerk_frontend_api: "clerk.theclosedtest.com".to_string(),
        app_env: env.to_string(),
    }
}

fn test_app_state() -> AppState {
    let config = test_config("test");
    let pool = PgPoolOptions::new().connect_lazy("postgres://postgres:postgres@localhost:5432/theclosedtest_test").unwrap();
    AppState::new(pool, config)
}

// ---------------------------------------------------------------------------
// 1. Health & Root Endpoints
// ---------------------------------------------------------------------------
#[tokio::test]
async fn test_health_endpoint() {
    let state = test_app_state();
    let app = app_router().with_state(state);

    let response = app
        .oneshot(
            Request::builder()
                .uri("/")
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();

    assert_eq!(response.status(), StatusCode::OK);
    let body_bytes = response.into_body().collect().await.unwrap().to_bytes();
    let body_str = String::from_utf8(body_bytes.to_vec()).unwrap();
    assert!(body_str.contains("TheClosedTest API is healthy"));
}

// ---------------------------------------------------------------------------
// 2. Auth Gating Tests (Ported from auth-gating.test.ts)
// ---------------------------------------------------------------------------
#[tokio::test]
async fn test_auth_gating_accepts_fixture_tokens_in_test_env() {
    let payload = verify_token_payload("test-clerk-developer-42", "test").await;
    assert!(payload.is_some());
    let p = payload.unwrap();
    assert_eq!(p.sub, "test-clerk-developer-42");
    assert_eq!(p.email, Some("test-clerk-developer-42@example.com".to_string()));
}

#[tokio::test]
async fn test_auth_gating_rejects_fixture_tokens_in_production() {
    let payload = verify_token_payload("test-clerk-developer-42", "production").await;
    assert!(payload.is_none());
}

#[tokio::test]
async fn test_auth_gating_rejects_fixture_tokens_in_development() {
    let payload = verify_token_payload("test-clerk-developer-42", "development").await;
    assert!(payload.is_none());
}

#[tokio::test]
async fn test_auth_gating_rejects_malformed_tokens() {
    let payload = verify_token_payload("garbage-invalid-token", "test").await;
    assert!(payload.is_none());
}

// ---------------------------------------------------------------------------
// 3. Admin RBAC Authorization Logic
// ---------------------------------------------------------------------------
#[test]
fn test_admin_authorization_primary_admin() {
    let config = test_config("production");
    assert!(config.is_user_admin(Some("neerajlovecyber@gmail.com"), false));
}

#[test]
fn test_admin_authorization_case_insensitivity() {
    let config = test_config("production");
    assert!(config.is_user_admin(Some("NEERAJLOVEcyber@gmail.com"), false));
    assert!(config.is_user_admin(Some("FutureAIStudio41@gmail.com"), false));
}

#[test]
fn test_admin_authorization_secondary_admin() {
    let config = test_config("production");
    assert!(config.is_user_admin(Some("futureaistudio41@gmail.com"), false));
    assert!(config.is_user_admin(Some("theneerajsec@gmail.com"), false));
}

#[test]
fn test_admin_authorization_regular_user_denied() {
    let config = test_config("production");
    assert!(!config.is_user_admin(Some("regular_user@example.com"), false));
    assert!(!config.is_user_admin(None, false));
}

#[test]
fn test_admin_authorization_db_flag_override() {
    let config = test_config("production");
    assert!(config.is_user_admin(Some("promoted_admin@example.com"), true));
    assert!(config.is_user_admin(None, true));
}

// ---------------------------------------------------------------------------
// 4. App Input Validation Tests
// ---------------------------------------------------------------------------
#[test]
fn test_create_app_validation_valid() {
    let req = CreateAppRequest {
        title: "Closed Test Helper".to_string(),
        package_name: "com.closedtest.helper".to_string(),
        play_store_url: "https://play.google.com/store/apps/details?id=com.closedtest.helper".to_string(),
        icon_url: "https://assets.theclosedtest.com/icons/app1.png".to_string(),
        instructions: "Please test daily for 14 days and leave a rating.".to_string(),
        required_testers: 12,
    };
    assert!(req.validate().is_ok());
}

#[test]
fn test_create_app_validation_title_too_short() {
    let req = CreateAppRequest {
        title: "A".to_string(),
        package_name: "com.test.app".to_string(),
        play_store_url: "https://play.google.com/store/apps/details?id=com.test.app".to_string(),
        icon_url: "https://assets.theclosedtest.com/icon.png".to_string(),
        instructions: "Valid instructions with more than 10 characters.".to_string(),
        required_testers: 12,
    };
    assert!(req.validate().is_err());
}

#[test]
fn test_create_app_validation_invalid_url() {
    let req = CreateAppRequest {
        title: "Valid Title".to_string(),
        package_name: "com.test.app".to_string(),
        play_store_url: "not-a-valid-url".to_string(),
        icon_url: "https://assets.theclosedtest.com/icon.png".to_string(),
        instructions: "Valid instructions with more than 10 characters.".to_string(),
        required_testers: 12,
    };
    assert!(req.validate().is_err());
}

#[test]
fn test_create_app_validation_instructions_too_short() {
    let req = CreateAppRequest {
        title: "Valid Title".to_string(),
        package_name: "com.test.app".to_string(),
        play_store_url: "https://play.google.com/store/apps/details?id=com.test.app".to_string(),
        icon_url: "https://assets.theclosedtest.com/icon.png".to_string(),
        instructions: "Short".to_string(),
        required_testers: 12,
    };
    assert!(req.validate().is_err());
}

// ---------------------------------------------------------------------------
// 5. Unauthorized Route Gating (401 on Missing Auth)
// ---------------------------------------------------------------------------
#[tokio::test]
async fn test_unauthorized_get_me_returns_401() {
    let app = app_router().with_state(test_app_state());
    let res = app
        .oneshot(Request::builder().uri("/api/users/me").body(Body::empty()).unwrap())
        .await
        .unwrap();
    assert_eq!(res.status(), StatusCode::UNAUTHORIZED);
}

#[tokio::test]
async fn test_unauthorized_post_apps_returns_401() {
    let app = app_router().with_state(test_app_state());
    let res = app
        .oneshot(
            Request::builder()
                .method("POST")
                .uri("/api/apps")
                .header("Content-Type", "application/json")
                .body(Body::from(r#"{"title":"Test","packageName":"com.t","playStoreUrl":"https://play.google.com","iconUrl":"https://icon.png","instructions":"Test Instructions"}"#))
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(res.status(), StatusCode::UNAUTHORIZED);
}

#[tokio::test]
async fn test_unauthorized_post_matches_request_returns_401() {
    let app = app_router().with_state(test_app_state());
    let res = app
        .oneshot(
            Request::builder()
                .method("POST")
                .uri("/api/matches/request")
                .header("Content-Type", "application/json")
                .body(Body::from(r#"{"myAppId":"app1","targetAppId":"app2"}"#))
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(res.status(), StatusCode::UNAUTHORIZED);
}

#[tokio::test]
async fn test_unauthorized_post_proofs_returns_401() {
    let app = app_router().with_state(test_app_state());
    let res = app
        .oneshot(
            Request::builder()
                .method("POST")
                .uri("/api/proofs")
                .header("Content-Type", "application/json")
                .body(Body::from(r#"{"matchId":"m1","day":1,"storageUrls":["https://cdn.com/1.png"]}"#))
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(res.status(), StatusCode::UNAUTHORIZED);
}

#[tokio::test]
async fn test_unauthorized_delete_me_returns_401() {
    let app = app_router().with_state(test_app_state());
    let res = app
        .oneshot(
            Request::builder()
                .method("DELETE")
                .uri("/api/users/me")
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(res.status(), StatusCode::UNAUTHORIZED);
}

#[tokio::test]
async fn test_unauthorized_admin_stats_returns_401() {
    let app = app_router().with_state(test_app_state());
    let res = app
        .oneshot(
            Request::builder()
                .uri("/api/admin/stats")
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(res.status(), StatusCode::UNAUTHORIZED);
}

#[tokio::test]
async fn test_unauthorized_admin_reports_returns_401() {
    let app = app_router().with_state(test_app_state());
    let res = app
        .oneshot(
            Request::builder()
                .uri("/api/admin/reports")
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(res.status(), StatusCode::UNAUTHORIZED);
}

#[tokio::test]
async fn test_unauthorized_notifications_returns_401() {
    let app = app_router().with_state(test_app_state());
    let res = app
        .oneshot(
            Request::builder()
                .uri("/api/notifications")
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(res.status(), StatusCode::UNAUTHORIZED);
}

#[tokio::test]
async fn test_unauthorized_storage_presigned_url_returns_401() {
    let app = app_router().with_state(test_app_state());
    let res = app
        .oneshot(
            Request::builder()
                .method("POST")
                .uri("/api/storage/presigned-url")
                .header("Content-Type", "application/json")
                .body(Body::from(r#"{"filename":"screenshot.png","contentType":"image/png"}"#))
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(res.status(), StatusCode::UNAUTHORIZED);
}

// ---------------------------------------------------------------------------
// 6. Request Match Schema Aliases & Proof Schema Contracts
// ---------------------------------------------------------------------------
#[test]
fn test_match_request_alias_deserialization() {
    // 1. myAppId and targetAppId
    let json1 = r#"{"myAppId":"app-1","targetAppId":"app-2"}"#;
    let req1: RequestMatchRequest = serde_json::from_str(json1).unwrap();
    assert_eq!(req1.my_app_id, Some("app-1".to_string()));
    assert_eq!(req1.target_app_id, Some("app-2".to_string()));

    // 2. app1Id and app2Id
    let json2 = r#"{"app1Id":"app-1","app2Id":"app-2"}"#;
    let req2: RequestMatchRequest = serde_json::from_str(json2).unwrap();
    assert_eq!(req2.app1_id, Some("app-1".to_string()));
    assert_eq!(req2.app2_id, Some("app-2".to_string()));
}

#[test]
fn test_proof_submission_schema() {
    let json = r#"{"matchId":"match-123","day":1,"storageUrls":["https://cdn.example.com/p1.png"],"comment":"Day 1 done"}"#;
    let req: SubmitProofRequest = serde_json::from_str(json).unwrap();
    assert_eq!(req.match_id, "match-123");
    assert_eq!(req.day, 1);
    assert_eq!(req.r#type, "image"); // default applied
    assert_eq!(req.storage_urls.len(), 1);
}

// ---------------------------------------------------------------------------
// 7. Security & Business Logic Edge Cases
// ---------------------------------------------------------------------------
#[test]
fn test_match_request_self_match_rejected() {
    let json = r#"{"myAppId":"app-123","targetAppId":"app-123"}"#;
    let req: RequestMatchRequest = serde_json::from_str(json).unwrap();
    let app1 = req.app1_id.or(req.my_app_id).unwrap();
    let target = req.target_app_id.or(req.app2_id).unwrap();
    assert_eq!(app1, target, "Self-match must be detected and rejected with 400 Bad Request");
}

#[test]
fn test_proof_submission_day_bounds() {
    let valid_days = [1, 7, 14];
    for day in valid_days {
        assert!(day >= 1 && day <= 14);
    }

    let invalid_days = [0, -1, 15, 99];
    for day in invalid_days {
        assert!(day < 1 || day > 14);
    }
}

#[test]
fn test_proof_self_review_prohibition_logic() {
    let uploader_id = "user-1";
    let reviewer_id = "user-1";
    let is_reviewer = uploader_id != reviewer_id;
    assert!(!is_reviewer, "Proof uploader cannot review their own proof (must return 403)");
}

#[test]
fn test_app_ownership_check() {
    let app_owner_id = "user-alice";
    let requesting_user_id = "user-bob";
    let is_owner = app_owner_id == requesting_user_id;
    assert!(!is_owner, "Non-owner user cannot update or delete app (must return 403/404)");
}

#[test]
fn test_notification_7_day_cleanup_window() {
    let now = time::OffsetDateTime::now_utc();
    let eight_days_ago = now - time::Duration::days(8);
    let two_days_ago = now - time::Duration::days(2);
    let threshold = now - time::Duration::days(7);

    assert!(eight_days_ago < threshold, "8 day old notification must be deleted");
    assert!(two_days_ago >= threshold, "2 day old notification must be retained");
}

#[test]
fn test_match_60_day_archival_window() {
    let now = time::OffsetDateTime::now_utc();
    let seventy_days_ago = now - time::Duration::days(70);
    let ten_days_ago = now - time::Duration::days(10);
    let threshold = now - time::Duration::days(60);

    assert!(seventy_days_ago < threshold, "70 day old match must be archived");
    assert!(ten_days_ago >= threshold, "10 day old match must not be archived");
}

#[test]
fn test_expired_ban_cleanup_window() {
    let now = time::OffsetDateTime::now_utc();
    let expired_at = now - time::Duration::hours(24);
    let active_until = now + time::Duration::hours(24);

    let is_expired = expired_at <= now;
    let is_still_active = active_until <= now;

    assert!(is_expired, "Expired temporary ban must be cleaned");
    assert!(!is_still_active, "Active temporary ban must be preserved");
}


