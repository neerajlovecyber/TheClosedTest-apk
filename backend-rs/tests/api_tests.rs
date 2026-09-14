use axum::{
    body::Body,
    http::{Request, StatusCode},
    routing::get,
    Router,
};
use http_body_util::BodyExt;
use tower::ServiceExt;
use validator::Validate;

use backend_rs::auth::clerk::verify_token_payload;
use backend_rs::config::Config;
use backend_rs::routes::apps::CreateAppRequest;
use backend_rs::routes::health::health_check;

#[tokio::test]
async fn test_health_endpoint() {
    let app = Router::new().route("/health", get(health_check));

    let response = app
        .oneshot(
            Request::builder()
                .uri("/health")
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();

    assert_eq!(response.status(), StatusCode::OK);

    let body_bytes = response.into_body().collect().await.unwrap().to_bytes();
    let body_str = String::from_utf8(body_bytes.to_vec()).unwrap();

    assert!(body_str.contains(r#""status":"ok""#));
    assert!(body_str.contains(r#""service":"theclosedtest-backend-rs""#));
}

#[tokio::test]
async fn test_token_verification_fixture() {
    let payload = verify_token_payload("test-clerk-developer-42", "test").await;
    assert!(payload.is_some());

    let payload = payload.unwrap();
    assert_eq!(payload.sub, "test-clerk-developer-42");
    assert_eq!(payload.email, Some("test-clerk-developer-42@example.com".to_string()));

    // Invalid token format
    let invalid = verify_token_payload("not-a-valid-token", "production").await;
    assert!(invalid.is_none());
}

#[test]
fn test_admin_authorization_logic() {
    let config = Config {
        database_url: "postgres://localhost".to_string(),
        port: 9000,
        clerk_secret_key: None,
        clerk_frontend_api: "clerk.example.com".to_string(),
        app_env: "test".to_string(),
    };

    // Primary admin email
    assert!(config.is_user_admin(Some("neerajlovecyber@gmail.com"), false));
    assert!(config.is_user_admin(Some("NEERAJLOVEcyber@gmail.com"), false));

    // Secondary admin email
    assert!(config.is_user_admin(Some("futureaistudio41@gmail.com"), false));

    // Non-admin email
    assert!(!config.is_user_admin(Some("regular_user@example.com"), false));

    // DB Admin flag override
    assert!(config.is_user_admin(Some("any_user@example.com"), true));
    assert!(config.is_user_admin(None, true));
    assert!(!config.is_user_admin(None, false));
}

#[test]
fn test_create_app_validation() {
    // Valid request
    let valid_req = CreateAppRequest {
        title: "Closed Test Helper".to_string(),
        package_name: "com.closedtest.helper".to_string(),
        play_store_url: "https://play.google.com/store/apps/details?id=com.closedtest.helper".to_string(),
        icon_url: "https://assets.theclosedtest.com/icons/app1.png".to_string(),
        instructions: "Please test daily for 14 days and leave a rating.".to_string(),
        required_testers: 12,
    };
    assert!(valid_req.validate().is_ok());

    // Title too short (< 2 chars)
    let invalid_title = CreateAppRequest {
        title: "A".to_string(),
        package_name: "com.test".to_string(),
        play_store_url: "https://play.google.com".to_string(),
        icon_url: "https://icon.png".to_string(),
        instructions: "Valid instruction length here.".to_string(),
        required_testers: 12,
    };
    assert!(invalid_title.validate().is_err());

    // Invalid URL
    let invalid_url = CreateAppRequest {
        title: "Valid Title".to_string(),
        package_name: "com.test".to_string(),
        play_store_url: "not-a-valid-url".to_string(),
        icon_url: "https://icon.png".to_string(),
        instructions: "Valid instruction length here.".to_string(),
        required_testers: 12,
    };
    assert!(invalid_url.validate().is_err());

    // Instructions too short (< 10 chars)
    let short_instructions = CreateAppRequest {
        title: "Valid Title".to_string(),
        package_name: "com.test".to_string(),
        play_store_url: "https://play.google.com".to_string(),
        icon_url: "https://icon.png".to_string(),
        instructions: "Short".to_string(),
        required_testers: 12,
    };
    assert!(short_instructions.validate().is_err());
}
