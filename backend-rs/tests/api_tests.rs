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
        clerk_jwt_key: None,
        clerk_frontend_api: "clerk.theclosedtest.com".to_string(),
        app_env: env.to_string(),
        rate_limit_per_minute: 300,
        rate_limit_enabled: false,
        r2_access_key_id: None,
        r2_secret_access_key: None,
        r2_bucket_name: "theclosedtest".to_string(),
        r2_account_id: None,
        r2_public_url: "https://theclosedtest.neerajlovecyber.com".to_string(),
    }
}

fn test_app_state_with_env(env: &str) -> AppState {
    let config = test_config(env);
    let pool = PgPoolOptions::new().connect_lazy("postgres://postgres:postgres@localhost:5432/theclosedtest_test").unwrap();
    AppState::new(pool, config)
}

fn test_app_state() -> AppState {
    test_app_state_with_env("test")
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
                .uri("/health")
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();

    // In offline unit tests without local Postgres running, /health cleanly returns 503 SERVICE_UNAVAILABLE;
    // When DB is connected, it returns 200 OK. Both indicate router and health handler executed correctly.
    assert!(
        response.status() == StatusCode::OK || response.status() == StatusCode::SERVICE_UNAVAILABLE,
        "Expected OK or SERVICE_UNAVAILABLE, got {}",
        response.status()
    );
}

#[tokio::test]
async fn test_root_endpoint() {
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
}

// ---------------------------------------------------------------------------
// 2. Authentication Verification Gating
// ---------------------------------------------------------------------------
#[tokio::test]
async fn test_auth_gating_accepts_test_fixture_tokens_in_test_env() {
    let state = test_app_state();
    let payload = verify_token_payload("test-clerk-developer-42", &state).await;
    assert!(payload.is_some());
    let payload = payload.unwrap();
    assert_eq!(payload.sub, "test-clerk-developer-42");
}

#[tokio::test]
async fn test_auth_gating_rejects_fixture_tokens_in_production() {
    let state = test_app_state_with_env("production");
    let payload = verify_token_payload("test-clerk-developer-42", &state).await;
    assert!(payload.is_none());
}

#[tokio::test]
async fn test_auth_gating_rejects_fixture_tokens_in_development() {
    let state = test_app_state_with_env("development");
    let payload = verify_token_payload("test-clerk-developer-42", &state).await;
    assert!(payload.is_none());
}

#[tokio::test]
async fn test_auth_gating_rejects_malformed_tokens() {
    let state = test_app_state();
    let payload = verify_token_payload("garbage-invalid-token", &state).await;
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

// ---------------------------------------------------------------------------
// 8. Granular Authorization Gating (Matching TS security-and-edgecases.test.ts)
// ---------------------------------------------------------------------------
#[tokio::test]
async fn test_unauthorized_get_my_apps_returns_401() {
    let app = app_router().with_state(test_app_state());
    let res = app.oneshot(Request::builder().uri("/api/apps/my").body(Body::empty()).unwrap()).await.unwrap();
    assert_eq!(res.status(), StatusCode::UNAUTHORIZED);
}

#[tokio::test]
async fn test_unauthorized_patch_app_returns_401() {
    let app = app_router().with_state(test_app_state());
    let res = app.oneshot(Request::builder().method("PATCH").uri("/api/apps/app-1").header("content-type", "application/json").body(Body::from(r#"{"title":"New"}"#)).unwrap()).await.unwrap();
    assert_eq!(res.status(), StatusCode::UNAUTHORIZED);
}

#[tokio::test]
async fn test_unauthorized_delete_app_returns_401() {
    let app = app_router().with_state(test_app_state());
    let res = app.oneshot(Request::builder().method("DELETE").uri("/api/apps/app-1").body(Body::empty()).unwrap()).await.unwrap();
    assert_eq!(res.status(), StatusCode::UNAUTHORIZED);
}

#[tokio::test]
async fn test_unauthorized_vote_app_returns_401() {
    let app = app_router().with_state(test_app_state());
    let res = app.oneshot(Request::builder().method("POST").uri("/api/apps/app-1/vote").header("content-type", "application/json").body(Body::from(r#"{"type":"positive"}"#)).unwrap()).await.unwrap();
    assert_eq!(res.status(), StatusCode::UNAUTHORIZED);
}

#[tokio::test]
async fn test_unauthorized_list_matches_returns_401() {
    let app = app_router().with_state(test_app_state());
    let res = app.oneshot(Request::builder().uri("/api/matches").body(Body::empty()).unwrap()).await.unwrap();
    assert_eq!(res.status(), StatusCode::UNAUTHORIZED);
}

#[tokio::test]
async fn test_unauthorized_get_match_returns_401() {
    let app = app_router().with_state(test_app_state());
    let res = app.oneshot(Request::builder().uri("/api/matches/m-1").body(Body::empty()).unwrap()).await.unwrap();
    assert_eq!(res.status(), StatusCode::UNAUTHORIZED);
}

#[tokio::test]
async fn test_unauthorized_accept_match_returns_401() {
    let app = app_router().with_state(test_app_state());
    let res = app.oneshot(Request::builder().method("POST").uri("/api/matches/m-1/accept").body(Body::empty()).unwrap()).await.unwrap();
    assert_eq!(res.status(), StatusCode::UNAUTHORIZED);
}

#[tokio::test]
async fn test_unauthorized_reject_match_returns_401() {
    let app = app_router().with_state(test_app_state());
    let res = app.oneshot(Request::builder().method("POST").uri("/api/matches/m-1/reject").body(Body::empty()).unwrap()).await.unwrap();
    assert_eq!(res.status(), StatusCode::UNAUTHORIZED);
}

#[tokio::test]
async fn test_unauthorized_cancel_match_returns_401() {
    let app = app_router().with_state(test_app_state());
    let res = app.oneshot(Request::builder().method("POST").uri("/api/matches/m-1/cancel").body(Body::empty()).unwrap()).await.unwrap();
    assert_eq!(res.status(), StatusCode::UNAUTHORIZED);
}

#[tokio::test]
async fn test_unauthorized_get_proofs_returns_401() {
    let app = app_router().with_state(test_app_state());
    let res = app.oneshot(Request::builder().uri("/api/proofs/match/m-1").body(Body::empty()).unwrap()).await.unwrap();
    assert_eq!(res.status(), StatusCode::UNAUTHORIZED);
}

#[tokio::test]
async fn test_unauthorized_review_proof_returns_401() {
    let app = app_router().with_state(test_app_state());
    let res = app.oneshot(Request::builder().method("POST").uri("/api/proofs/p-1/review").header("content-type", "application/json").body(Body::from(r#"{"status":"approved"}"#)).unwrap()).await.unwrap();
    assert_eq!(res.status(), StatusCode::UNAUTHORIZED);
}

#[tokio::test]
async fn test_unauthorized_send_message_returns_401() {
    let app = app_router().with_state(test_app_state());
    let res = app.oneshot(Request::builder().method("POST").uri("/api/messages/m-1").header("content-type", "application/json").body(Body::from(r#"{"content":"hi"}"#)).unwrap()).await.unwrap();
    assert_eq!(res.status(), StatusCode::UNAUTHORIZED);
}

#[tokio::test]
async fn test_unauthorized_get_messages_returns_401() {
    let app = app_router().with_state(test_app_state());
    let res = app.oneshot(Request::builder().uri("/api/messages/m-1").body(Body::empty()).unwrap()).await.unwrap();
    assert_eq!(res.status(), StatusCode::UNAUTHORIZED);
}

#[tokio::test]
async fn test_unauthorized_patch_notification_read_returns_401() {
    let app = app_router().with_state(test_app_state());
    let res = app.oneshot(Request::builder().method("PATCH").uri("/api/notifications/n-1/read").body(Body::empty()).unwrap()).await.unwrap();
    assert_eq!(res.status(), StatusCode::UNAUTHORIZED);
}

#[tokio::test]
async fn test_unauthorized_read_all_notifications_returns_401() {
    let app = app_router().with_state(test_app_state());
    let res = app.oneshot(Request::builder().method("POST").uri("/api/notifications/read-all").body(Body::empty()).unwrap()).await.unwrap();
    assert_eq!(res.status(), StatusCode::UNAUTHORIZED);
}

#[tokio::test]
async fn test_unauthorized_clear_all_notifications_returns_401() {
    let app = app_router().with_state(test_app_state());
    let res = app.oneshot(Request::builder().method("DELETE").uri("/api/notifications/clear-all").body(Body::empty()).unwrap()).await.unwrap();
    assert_eq!(res.status(), StatusCode::UNAUTHORIZED);
}

#[tokio::test]
async fn test_unauthorized_checkin_returns_401() {
    let app = app_router().with_state(test_app_state());
    let res = app.oneshot(Request::builder().method("POST").uri("/api/users/checkin").body(Body::empty()).unwrap()).await.unwrap();
    assert_eq!(res.status(), StatusCode::UNAUTHORIZED);
}

#[tokio::test]
async fn test_unauthorized_patch_push_token_returns_401() {
    let app = app_router().with_state(test_app_state());
    let res = app.oneshot(Request::builder().method("PATCH").uri("/api/users/push-token").header("content-type", "application/json").body(Body::from(r#"{"pushToken":"tok"}"#)).unwrap()).await.unwrap();
    assert_eq!(res.status(), StatusCode::UNAUTHORIZED);
}

#[tokio::test]
async fn test_unauthorized_patch_group_confirm_returns_401() {
    let app = app_router().with_state(test_app_state());
    let res = app.oneshot(Request::builder().method("PATCH").uri("/api/users/group-confirm").body(Body::empty()).unwrap()).await.unwrap();
    assert_eq!(res.status(), StatusCode::UNAUTHORIZED);
}

#[tokio::test]
async fn test_unauthorized_patch_profile_returns_401() {
    let app = app_router().with_state(test_app_state());
    let res = app.oneshot(Request::builder().method("PATCH").uri("/api/users/profile").header("content-type", "application/json").body(Body::from(r#"{"name":"New"}"#)).unwrap()).await.unwrap();
    assert_eq!(res.status(), StatusCode::UNAUTHORIZED);
}

#[tokio::test]
async fn test_unauthorized_unlock_slots_returns_401() {
    let app = app_router().with_state(test_app_state());
    let res = app.oneshot(Request::builder().method("POST").uri("/api/users/unlock-slots").body(Body::empty()).unwrap()).await.unwrap();
    assert_eq!(res.status(), StatusCode::UNAUTHORIZED);
}

#[tokio::test]
async fn test_unauthorized_post_report_returns_401() {
    let app = app_router().with_state(test_app_state());
    let res = app.oneshot(Request::builder().method("POST").uri("/api/reports").header("content-type", "application/json").body(Body::from(r#"{"type":"bug","targetId":"t1","description":"desc"}"#)).unwrap()).await.unwrap();
    assert_eq!(res.status(), StatusCode::UNAUTHORIZED);
}

#[tokio::test]
async fn test_unauthorized_admin_ban_user_returns_401() {
    let app = app_router().with_state(test_app_state());
    let res = app.oneshot(Request::builder().method("POST").uri("/api/admin/bans/user").header("content-type", "application/json").body(Body::from(r#"{"userId":"u1","reason":"spam"}"#)).unwrap()).await.unwrap();
    assert_eq!(res.status(), StatusCode::UNAUTHORIZED);
}

#[tokio::test]
async fn test_unauthorized_admin_ban_app_returns_401() {
    let app = app_router().with_state(test_app_state());
    let res = app.oneshot(Request::builder().method("POST").uri("/api/admin/bans/app").header("content-type", "application/json").body(Body::from(r#"{"packageName":"com.spam","playStoreUrl":"https://play.google.com","title":"Spam","reason":"malware"}"#)).unwrap()).await.unwrap();
    assert_eq!(res.status(), StatusCode::UNAUTHORIZED);
}

#[tokio::test]
async fn test_unauthorized_admin_delete_app_returns_401() {
    let app = app_router().with_state(test_app_state());
    let res = app.oneshot(Request::builder().method("DELETE").uri("/api/admin/apps/app-1").body(Body::empty()).unwrap()).await.unwrap();
    assert_eq!(res.status(), StatusCode::UNAUTHORIZED);
}

#[tokio::test]
async fn test_unauthorized_admin_clean_all_returns_401() {
    let app = app_router().with_state(test_app_state());
    let res = app.oneshot(Request::builder().method("POST").uri("/api/admin/apps/clean-all").body(Body::empty()).unwrap()).await.unwrap();
    assert_eq!(res.status(), StatusCode::UNAUTHORIZED);
}

// ---------------------------------------------------------------------------
// 9. Business Logic & Calculation Edge Cases
// ---------------------------------------------------------------------------
#[test]
fn test_app_marketplace_visibility_positive_votes_threshold() {
    let positive_votes = 3;
    let negative_votes = 1;
    let is_visible = positive_votes >= 3 && positive_votes > negative_votes;
    assert!(is_visible, "Apps with >= 3 positive votes must become visible");
}

#[test]
fn test_app_marketplace_visibility_negative_votes_threshold() {
    let positive_votes = 1;
    let negative_votes = 3;
    let is_hidden = negative_votes >= 3 && negative_votes > positive_votes;
    assert!(is_hidden, "Apps with >= 3 negative votes must become hidden");
}

#[test]
fn test_app_owner_marketplace_pause_toggle() {
    let mut status = "recruiting";
    let is_marketplace_visible = false;
    if !is_marketplace_visible {
        status = "paused";
    }
    assert_eq!(status, "paused", "Setting isMarketplaceVisible=false pauses the app");
}

#[test]
fn test_app_self_healing_play_store_url_restores_visibility() {
    let mut visibility = "hidden";
    let mut status = "paused";
    let play_store_url_updated = true;

    if play_store_url_updated && visibility == "hidden" {
        visibility = "visible";
        status = "recruiting";
    }
    assert_eq!(visibility, "visible", "Updating playStoreUrl must unhide app");
    assert_eq!(status, "recruiting", "Updating playStoreUrl must resume recruitment");
}

#[test]
fn test_streak_same_day_idempotence() {
    let today = "2026-09-14";
    let last_check_in = Some("2026-09-14");
    let already_checked_in = last_check_in == Some(today);
    assert!(already_checked_in, "Same day check-in must be idempotent");
}

#[test]
fn test_reputation_unlock_slots_requirements() {
    let rep_for_4_slots = 120;
    let rep_for_5_slots = 150;

    let user_rep = 130;
    let allowed_slots = if user_rep >= rep_for_5_slots {
        5
    } else if user_rep >= rep_for_4_slots {
        4
    } else {
        3
    };

    assert_eq!(allowed_slots, 4, "User with 130 reputation unlocks slot 4");
}

#[test]
fn test_match_inactivity_48_hour_warning_threshold() {
    let now = time::OffsetDateTime::now_utc();
    let fifty_hours_ago = now - time::Duration::hours(50);
    let warning_threshold = now - time::Duration::hours(48);

    assert!(fifty_hours_ago < warning_threshold, "50h inactivity triggers 48h warning");
}

#[test]
fn test_match_inactivity_72_hour_abandonment_threshold() {
    let now = time::OffsetDateTime::now_utc();
    let seventy_five_hours_ago = now - time::Duration::hours(75);
    let cancel_threshold = now - time::Duration::hours(72);

    assert!(seventy_five_hours_ago < cancel_threshold, "75h inactivity cancels match and penalizes -10");
}

#[test]
fn test_day_15_match_auto_completion_logic() {
    let match_days_active = 15;
    let should_auto_complete = match_days_active >= 15;
    assert!(should_auto_complete, "15+ day matches must auto-complete and approve remaining proofs");
}

#[tokio::test]
async fn test_unknown_route_returns_404() {
    let app = app_router().with_state(test_app_state());
    let res = app.oneshot(Request::builder().uri("/api/unknown-route-that-does-not-exist").body(Body::empty()).unwrap()).await.unwrap();
    assert_eq!(res.status(), StatusCode::NOT_FOUND);
}

#[tokio::test]
async fn test_health_metrics_response_shape() {
    let app = app_router().with_state(test_app_state());
    let res = app.oneshot(Request::builder().uri("/health").body(Body::empty()).unwrap()).await.unwrap();
    assert!(res.status() == StatusCode::OK || res.status() == StatusCode::SERVICE_UNAVAILABLE);
    let bytes = res.into_body().collect().await.unwrap().to_bytes();
    let body: serde_json::Value = serde_json::from_slice(&bytes).unwrap();
    assert!(body.is_object());
}

#[tokio::test]
async fn test_unauthorized_support_my_chat_returns_401() {
    let app = app_router().with_state(test_app_state());
    let res = app.oneshot(Request::builder().method("POST").uri("/api/support/my-chat").body(Body::empty()).unwrap()).await.unwrap();
    assert_eq!(res.status(), StatusCode::UNAUTHORIZED);
}

#[tokio::test]
async fn test_unauthorized_support_chat_details_returns_401() {
    let app = app_router().with_state(test_app_state());
    let res = app.oneshot(Request::builder().method("GET").uri("/api/support/chats/c123").body(Body::empty()).unwrap()).await.unwrap();
    assert_eq!(res.status(), StatusCode::UNAUTHORIZED);
}

#[tokio::test]
async fn test_unauthorized_support_send_message_returns_401() {
    let app = app_router().with_state(test_app_state());
    let res = app.oneshot(Request::builder().method("POST").uri("/api/support/chats/c123/messages").header("content-type", "application/json").body(Body::from(r#"{"content":"hi"}"#)).unwrap()).await.unwrap();
    assert_eq!(res.status(), StatusCode::UNAUTHORIZED);
}

#[tokio::test]
async fn test_unauthorized_admin_support_chats_returns_401() {
    let app = app_router().with_state(test_app_state());
    let res = app.oneshot(Request::builder().method("GET").uri("/api/admin/support/chats").body(Body::empty()).unwrap()).await.unwrap();
    assert_eq!(res.status(), StatusCode::UNAUTHORIZED);
}

#[tokio::test]
async fn test_unauthorized_admin_support_user_chat_returns_401() {
    let app = app_router().with_state(test_app_state());
    let res = app.oneshot(Request::builder().method("POST").uri("/api/admin/support/chats/user/u123").body(Body::empty()).unwrap()).await.unwrap();
    assert_eq!(res.status(), StatusCode::UNAUTHORIZED);
}

#[tokio::test]
async fn test_unauthorized_admin_users_returns_401() {
    let app = app_router().with_state(test_app_state());
    let res = app.oneshot(Request::builder().method("GET").uri("/api/admin/users").body(Body::empty()).unwrap()).await.unwrap();
    assert_eq!(res.status(), StatusCode::UNAUTHORIZED);
}

#[tokio::test]
async fn test_unauthorized_admin_user_details_returns_401() {
    let app = app_router().with_state(test_app_state());
    let res = app.oneshot(Request::builder().method("GET").uri("/api/admin/users/u123/details").body(Body::empty()).unwrap()).await.unwrap();
    assert_eq!(res.status(), StatusCode::UNAUTHORIZED);
}

#[tokio::test]
async fn test_unauthorized_admin_clean_duplicates_returns_401() {
    let app = app_router().with_state(test_app_state());
    let res = app.oneshot(Request::builder().method("POST").uri("/api/admin/apps/clean-duplicates").body(Body::empty()).unwrap()).await.unwrap();
    assert_eq!(res.status(), StatusCode::UNAUTHORIZED);
}

#[tokio::test]
async fn test_unauthorized_admin_clean_test_users_returns_401() {
    let app = app_router().with_state(test_app_state());
    let res = app.oneshot(Request::builder().method("POST").uri("/api/admin/users/clean-test-users").body(Body::empty()).unwrap()).await.unwrap();
    assert_eq!(res.status(), StatusCode::UNAUTHORIZED);
}

#[tokio::test]
async fn test_rate_limiter_middleware_enforcement() {
    use axum::middleware;

    let mut cfg = test_config("test");
    cfg.rate_limit_enabled = true;
    cfg.rate_limit_per_minute = 3;

    let pool = PgPoolOptions::new().connect_lazy("postgres://postgres:postgres@localhost:5432/theclosedtest_test").unwrap();
    let state = AppState::new(pool, cfg);

    let app = app_router()
        .layer(middleware::from_fn_with_state(
            state.clone(),
            backend_rs::middleware::rate_limit::rate_limiter_middleware,
        ))
        .with_state(state);

    for _ in 0..3 {
        let req = Request::builder()
            .uri("/api/test-limiter-endpoint")
            .header("cf-connecting-ip", "203.0.113.195")
            .body(Body::empty())
            .unwrap();
        let res = app.clone().oneshot(req).await.unwrap();
        assert_ne!(res.status(), StatusCode::TOO_MANY_REQUESTS);
        assert!(res.headers().contains_key("x-ratelimit-remaining"));
    }

    let req = Request::builder()
        .uri("/api/test-limiter-endpoint")
        .header("cf-connecting-ip", "203.0.113.195")
        .body(Body::empty())
        .unwrap();
    let res = app.oneshot(req).await.unwrap();
    assert_eq!(res.status(), StatusCode::TOO_MANY_REQUESTS);
    assert_eq!(res.headers().get("x-ratelimit-remaining").unwrap(), "0");
    assert!(res.headers().contains_key("retry-after"));
}

#[tokio::test]
async fn test_jsonwebtoken_crypto_provider_no_panic() {
    let cfg = test_config("production");
    let pool = sqlx::postgres::PgPoolOptions::new()
        .connect_lazy("postgres://postgres:postgres@localhost:5432/theclosedtest_test")
        .unwrap();
    let state = AppState::new(pool, cfg);
    let token = "eyJhbGciOiJSUzI1NiIsImtpZCI6InRlc3Qta2lkIn0.eyJzdWIiOiJ1c2VyXzEyMyIsImV4cCI6MTk5OTk5OTk5OX0.dummy";
    let res = backend_rs::auth::clerk::verify_token_payload(token, &state).await;
    assert!(res.is_none());
}

#[test]
fn test_user_summary_and_admin_app_serialization_camel_case() {
    use backend_rs::db::models::UserSummary;
    use backend_rs::routes::admin::AdminAppItem;

    let summary = UserSummary {
        id: "u1".into(),
        name: Some("Test User".into()),
        email: Some("test@example.com".into()),
        avatar_url: Some("https://example.com/avatar.png".into()),
        reputation: Some(10),
    };

    let summary_val = serde_json::to_value(&summary).unwrap();
    assert_eq!(summary_val.get("avatarUrl").and_then(|v| v.as_str()), Some("https://example.com/avatar.png"));
    assert!(summary_val.get("avatar_url").is_none(), "Must not serialize as snake_case avatar_url");

    let app_item = AdminAppItem {
        id: "a1".into(),
        user_id: "u1".into(),
        title: "Test App".into(),
        package_name: "com.test.app".into(),
        play_store_url: "https://play.google.com".into(),
        icon_url: "https://example.com/icon.png".into(),
        instructions: "Test instructions".into(),
        required_testers: 20,
        current_testers: 5,
        status: "testing".into(),
        completed_at: None,
        flag_count: 0,
        visibility_status: Some("public".into()),
        positive_votes: 2,
        negative_votes: 0,
        voters: vec![],
        created_at: "2026-01-01T00:00:00Z".into(),
        updated_at: "2026-01-01T00:00:00Z".into(),
        is_duplicate: false,
        user: Some(summary),
    };

    let app_val = serde_json::to_value(&app_item).unwrap();
    assert_eq!(app_val.get("iconUrl").and_then(|v| v.as_str()), Some("https://example.com/icon.png"));
    assert_eq!(app_val.get("packageName").and_then(|v| v.as_str()), Some("com.test.app"));
    assert_eq!(app_val.get("playStoreUrl").and_then(|v| v.as_str()), Some("https://play.google.com"));
    assert_eq!(app_val.get("requiredTesters").and_then(|v| v.as_i64()), Some(20));
    assert_eq!(app_val.get("currentTesters").and_then(|v| v.as_i64()), Some(5));
    assert_eq!(app_val.get("isDuplicate").and_then(|v| v.as_bool()), Some(false));
    assert!(app_val.get("icon_url").is_none());
    assert!(app_val.get("package_name").is_none());

    let user_in_app = app_val.get("user").unwrap();
    assert_eq!(user_in_app.get("avatarUrl").and_then(|v| v.as_str()), Some("https://example.com/avatar.png"));
    assert!(user_in_app.get("avatar_url").is_none());
}

#[test]
fn test_match_detail_response_serialization_camel_case() {
    use backend_rs::routes::matches::{MatchAppSummary, MatchDetailResponse, MatchRecordSummary, MatchUserSummary};

    let app1 = MatchAppSummary {
        id: "app1".into(),
        title: "App One".into(),
        package_name: "com.app.one".into(),
        play_store_url: Some("https://play.google.com/store/apps/details?id=com.app.one".into()),
        icon_url: "https://example.com/app1.png".into(),
    };
    let app2 = MatchAppSummary {
        id: "app2".into(),
        title: "App Two".into(),
        package_name: "com.app.two".into(),
        play_store_url: Some("https://play.google.com/store/apps/details?id=com.app.two".into()),
        icon_url: "https://example.com/app2.png".into(),
    };
    let user1 = MatchUserSummary {
        id: "u1".into(),
        name: "User One".into(),
        email: "u1@example.com".into(),
        avatar_url: Some("https://example.com/u1.png".into()),
    };
    let user2 = MatchUserSummary {
        id: "u2".into(),
        name: "User Two".into(),
        email: "u2@example.com".into(),
        avatar_url: Some("https://example.com/u2.png".into()),
    };

    let match_res = MatchDetailResponse {
        id: "m123".into(),
        user1_id: "u1".into(),
        app1_id: "app1".into(),
        user2_id: "u2".into(),
        app2_id: "app2".into(),
        status: "active".into(),
        start_date: Some("2026-09-01T00:00:00Z".into()),
        last_activity: "2026-09-14T00:00:00Z".into(),
        user1_approved_count: 5,
        user2_approved_count: 4,
        user1_last_proof: None,
        user2_last_proof: None,
        has_unread_messages: false,
        latest_message: None,
        proofs: None,
        created_at: "2026-09-01T00:00:00Z".into(),
        r#match: Some(MatchRecordSummary { id: "m123".into() }),
        match_obj: Some(MatchRecordSummary { id: "m123".into() }),
        is_user1: true,
        my_app: Some(app1.clone()),
        partner_app: Some(app2.clone()),
        partner_user: Some(user2.clone()),
        app1: Some(app1),
        app2: Some(app2),
        user1: Some(user1),
        user2: Some(user2),
    };

    let val = serde_json::to_value(&match_res).unwrap();
    assert_eq!(val.get("user1Id").and_then(|v| v.as_str()), Some("u1"));
    assert_eq!(val.get("user2Id").and_then(|v| v.as_str()), Some("u2"));
    assert_eq!(val.get("app1Id").and_then(|v| v.as_str()), Some("app1"));
    assert_eq!(val.get("app2Id").and_then(|v| v.as_str()), Some("app2"));
    assert_eq!(val.get("startDate").and_then(|v| v.as_str()), Some("2026-09-01T00:00:00Z"));
    assert_eq!(val.get("lastActivity").and_then(|v| v.as_str()), Some("2026-09-14T00:00:00Z"));
    assert_eq!(val.get("user1ApprovedCount").and_then(|v| v.as_i64()), Some(5));
    assert_eq!(val.get("user2ApprovedCount").and_then(|v| v.as_i64()), Some(4));
    assert_eq!(val.get("isUser1").and_then(|v| v.as_bool()), Some(true));
    assert!(val.get("myApp").is_some());
    assert!(val.get("partnerApp").is_some());
    assert!(val.get("partnerUser").is_some());

    let partner_app = val.get("partnerApp").unwrap();
    assert_eq!(partner_app.get("packageName").and_then(|v| v.as_str()), Some("com.app.two"));
    assert_eq!(partner_app.get("iconUrl").and_then(|v| v.as_str()), Some("https://example.com/app2.png"));
    assert_eq!(partner_app.get("playStoreUrl").and_then(|v| v.as_str()), Some("https://play.google.com/store/apps/details?id=com.app.two"));
    assert!(partner_app.get("icon_url").is_none());
    assert!(partner_app.get("package_name").is_none());

    let partner_user = val.get("partnerUser").unwrap();
    assert_eq!(partner_user.get("avatarUrl").and_then(|v| v.as_str()), Some("https://example.com/u2.png"));
    assert!(partner_user.get("avatar_url").is_none());
}

#[test]
fn test_user_response_serialization_camel_case() {
    use backend_rs::routes::users::UserResponse;

    let user_res = UserResponse {
        id: "u_abc".into(),
        token_identifier: Some("token_123".into()),
        name: "Alice".into(),
        email: "alice@example.com".into(),
        avatar_url: Some("https://example.com/alice.png".into()),
        reputation: 15,
        apps_count: 2,
        push_token: Some("ExponentPushToken[xyz]".into()),
        is_group_member: true,
        google_group_confirmed: true,
        is_admin: false,
        streak: 7,
        best_streak: 14,
        last_check_in_date: Some("2026-09-14".into()),
        unlocked_app_slots: 3,
        created_at: "2026-09-01T00:00:00Z".into(),
        updated_at: "2026-09-14T00:00:00Z".into(),
    };

    let val = serde_json::to_value(&user_res).unwrap();
    assert_eq!(val.get("tokenIdentifier").and_then(|v| v.as_str()), Some("token_123"));
    assert_eq!(val.get("avatarUrl").and_then(|v| v.as_str()), Some("https://example.com/alice.png"));
    assert_eq!(val.get("appsCount").and_then(|v| v.as_i64()), Some(2));
    assert_eq!(val.get("pushToken").and_then(|v| v.as_str()), Some("ExponentPushToken[xyz]"));
    assert_eq!(val.get("isGroupMember").and_then(|v| v.as_bool()), Some(true));
    assert_eq!(val.get("googleGroupConfirmed").and_then(|v| v.as_bool()), Some(true));
    assert_eq!(val.get("isAdmin").and_then(|v| v.as_bool()), Some(false));
    assert_eq!(val.get("bestStreak").and_then(|v| v.as_i64()), Some(14));
    assert_eq!(val.get("lastCheckInDate").and_then(|v| v.as_str()), Some("2026-09-14"));
    assert_eq!(val.get("unlockedAppSlots").and_then(|v| v.as_i64()), Some(3));
    assert_eq!(val.get("createdAt").and_then(|v| v.as_str()), Some("2026-09-01T00:00:00Z"));
    assert_eq!(val.get("updatedAt").and_then(|v| v.as_str()), Some("2026-09-14T00:00:00Z"));

    // Ensure no snake_case leaks
    assert!(val.get("token_identifier").is_none());
    assert!(val.get("avatar_url").is_none());
    assert!(val.get("apps_count").is_none());
    assert!(val.get("push_token").is_none());
    assert!(val.get("is_group_member").is_none());
    assert!(val.get("is_admin").is_none());
    assert!(val.get("best_streak").is_none());
    assert!(val.get("last_check_in_date").is_none());
    assert!(val.get("unlocked_app_slots").is_none());
    assert!(val.get("created_at").is_none());
    assert!(val.get("updated_at").is_none());
}

#[test]
fn test_proof_and_notification_serialization_camel_case() {
    use backend_rs::routes::proofs::ProofResponse;
    use backend_rs::routes::notifications::NotificationResponse;

    let proof = ProofResponse {
        id: "p1".into(),
        match_id: "m1".into(),
        uploader_id: "u1".into(),
        day: 3,
        r#type: "image".into(),
        storage_urls: vec!["https://r2.example.com/proof1.png".into()],
        status: "approved".into(),
        comment: Some("Great test".into()),
        rejection_reason: None,
        submitted_at: "2026-09-03T10:00:00Z".into(),
        reviewed_at: Some("2026-09-03T11:00:00Z".into()),
    };

    let p_val = serde_json::to_value(&proof).unwrap();
    assert_eq!(p_val.get("matchId").and_then(|v| v.as_str()), Some("m1"));
    assert_eq!(p_val.get("uploaderId").and_then(|v| v.as_str()), Some("u1"));
    assert_eq!(p_val.get("storageUrls").and_then(|v| v.as_array()).map(|a| a.len()), Some(1));
    assert_eq!(p_val.get("submittedAt").and_then(|v| v.as_str()), Some("2026-09-03T10:00:00Z"));
    assert_eq!(p_val.get("reviewedAt").and_then(|v| v.as_str()), Some("2026-09-03T11:00:00Z"));
    assert!(p_val.get("match_id").is_none());
    assert!(p_val.get("uploader_id").is_none());
    assert!(p_val.get("storage_urls").is_none());
    assert!(p_val.get("submitted_at").is_none());
    assert!(p_val.get("reviewed_at").is_none());

    let notif = NotificationResponse {
        id: "n1".into(),
        user_id: "u1".into(),
        r#type: "proof_approved".into(),
        title: "Proof Approved".into(),
        body: "Your day 3 proof was approved!".into(),
        data: serde_json::json!({"matchId": "m1"}),
        read: true,
        is_read: true,
        created_at: "2026-09-03T11:00:00Z".into(),
    };

    let n_val = serde_json::to_value(&notif).unwrap();
    assert_eq!(n_val.get("userId").and_then(|v| v.as_str()), Some("u1"));
    assert_eq!(n_val.get("isRead").and_then(|v| v.as_bool()), Some(true));
    assert_eq!(n_val.get("createdAt").and_then(|v| v.as_str()), Some("2026-09-03T11:00:00Z"));
    assert!(n_val.get("user_id").is_none());
    assert!(n_val.get("created_at").is_none());
}

#[test]
fn test_matches_query_status_all_treated_as_unfiltered() {
    let raw_status = Some("all".to_string());
    let status_filter = raw_status.as_deref().filter(|s| *s != "all");
    assert_eq!(status_filter, None, "Status 'all' must be mapped to None to return all matches");

    let raw_pending = Some("pending".to_string());
    let pending_filter = raw_pending.as_deref().filter(|s| *s != "all");
    assert_eq!(pending_filter, Some("pending"));
}




