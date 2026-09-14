use axum::{
    body::Body,
    http::{Request, StatusCode},
};
use http_body_util::BodyExt;
use serde_json::{json, Value};
use tower::ServiceExt;

mod common;
use common::create_test_context;
use backend_rs::routes::app_router;

#[tokio::test]
async fn test_full_database_lifecycle_e2e() {
    let ctx = create_test_context().await;
    if !ctx.is_live_db {
        println!("[info] Skipping live database integration test (no live DB or postgresql_embedded active).");
        return;
    }

    let app = app_router().with_state(ctx.state);

    // 1. User 1 Sync
    let user1_token = "fixture_token_user_1";
    let sync_req = Request::builder()
        .method("POST")
        .uri("/api/users/sync")
        .header("authorization", format!("Bearer {}", user1_token))
        .header("content-type", "application/json")
        .body(Body::from(
            json!({
                "tokenIdentifier": user1_token,
                "name": "Developer Alice",
                "email": "alice_test@example.com",
            })
            .to_string(),
        ))
        .unwrap();

    let res = app.clone().oneshot(sync_req).await.unwrap();
    assert!(res.status() == StatusCode::OK || res.status() == StatusCode::CREATED);
    let body: Value = serde_json::from_slice(&res.into_body().collect().await.unwrap().to_bytes()).unwrap();
    let _user1_id = body["id"].as_str().unwrap().to_string();
    assert_eq!(body["name"], "Developer Alice");
    assert_eq!(body["reputation"], 100);

    // 2. User 2 Sync
    let user2_token = "fixture_token_user_2";
    let sync_req2 = Request::builder()
        .method("POST")
        .uri("/api/users/sync")
        .header("authorization", format!("Bearer {}", user2_token))
        .header("content-type", "application/json")
        .body(Body::from(
            json!({
                "tokenIdentifier": user2_token,
                "name": "Developer Bob",
                "email": "bob_test@example.com",
            })
            .to_string(),
        ))
        .unwrap();

    let res2 = app.clone().oneshot(sync_req2).await.unwrap();
    assert!(res2.status() == StatusCode::OK || res2.status() == StatusCode::CREATED);
    let body2: Value = serde_json::from_slice(&res2.into_body().collect().await.unwrap().to_bytes()).unwrap();
    let _user2_id = body2["id"].as_str().unwrap().to_string();
    assert_eq!(body2["name"], "Developer Bob");

    // 3. User 1 creates App 1
    let app1_req = Request::builder()
        .method("POST")
        .uri("/api/apps")
        .header("authorization", format!("Bearer {}", user1_token))
        .header("content-type", "application/json")
        .body(Body::from(
            json!({
                "title": "Alice Productivity Tool",
                "packageName": "com.alice.productivity",
                "playStoreUrl": "https://play.google.com/store/apps/details?id=com.alice.productivity",
                "iconUrl": "https://example.com/icon1.png",
                "instructions": "Open the app daily and test productivity tracking.",
                "requiredTesters": 12
            })
            .to_string(),
        ))
        .unwrap();

    let res_app1 = app.clone().oneshot(app1_req).await.unwrap();
    assert_eq!(res_app1.status(), StatusCode::CREATED);
    let app1_body: Value = serde_json::from_slice(&res_app1.into_body().collect().await.unwrap().to_bytes()).unwrap();
    let app1_id = app1_body["id"].as_str().unwrap().to_string();

    // 4. User 2 creates App 2
    let app2_req = Request::builder()
        .method("POST")
        .uri("/api/apps")
        .header("authorization", format!("Bearer {}", user2_token))
        .header("content-type", "application/json")
        .body(Body::from(
            json!({
                "title": "Bob Fitness Tracker",
                "packageName": "com.bob.fitness",
                "playStoreUrl": "https://play.google.com/store/apps/details?id=com.bob.fitness",
                "iconUrl": "https://example.com/icon2.png",
                "instructions": "Log workouts and verify that step counters sync.",
                "requiredTesters": 12
            })
            .to_string(),
        ))
        .unwrap();

    let res_app2 = app.clone().oneshot(app2_req).await.unwrap();
    assert_eq!(res_app2.status(), StatusCode::CREATED);
    let app2_body: Value = serde_json::from_slice(&res_app2.into_body().collect().await.unwrap().to_bytes()).unwrap();
    let app2_id = app2_body["id"].as_str().unwrap().to_string();

    // 5. User 1 requests match between App 1 and App 2
    let match_req = Request::builder()
        .method("POST")
        .uri("/api/matches/request")
        .header("authorization", format!("Bearer {}", user1_token))
        .header("content-type", "application/json")
        .body(Body::from(
            json!({
                "myAppId": app1_id,
                "targetAppId": app2_id
            })
            .to_string(),
        ))
        .unwrap();

    let res_match = app.clone().oneshot(match_req).await.unwrap();
    assert_eq!(res_match.status(), StatusCode::CREATED);
    let match_body: Value = serde_json::from_slice(&res_match.into_body().collect().await.unwrap().to_bytes()).unwrap();
    let match_id = match_body["id"].as_str().unwrap().to_string();
    assert_eq!(match_body["status"], "pending");

    // 6. User 2 accepts the match
    let accept_req = Request::builder()
        .method("POST")
        .uri(format!("/api/matches/{}/accept", match_id))
        .header("authorization", format!("Bearer {}", user2_token))
        .body(Body::empty())
        .unwrap();

    let res_accept = app.clone().oneshot(accept_req).await.unwrap();
    assert_eq!(res_accept.status(), StatusCode::OK);
    let accept_body: Value = serde_json::from_slice(&res_accept.into_body().collect().await.unwrap().to_bytes()).unwrap();
    assert_eq!(accept_body["status"], "active");

    // 7. User 1 submits proof for Day 1
    let proof_req = Request::builder()
        .method("POST")
        .uri("/api/proofs")
        .header("authorization", format!("Bearer {}", user1_token))
        .header("content-type", "application/json")
        .body(Body::from(
            json!({
                "matchId": match_id,
                "day": 1,
                "type": "image",
                "storageUrls": ["https://r2.theclosedtest.com/proof1.jpg"],
                "comment": "Day 1 completed successfully"
            })
            .to_string(),
        ))
        .unwrap();

    let res_proof = app.clone().oneshot(proof_req).await.unwrap();
    assert_eq!(res_proof.status(), StatusCode::CREATED);
    let proof_body: Value = serde_json::from_slice(&res_proof.into_body().collect().await.unwrap().to_bytes()).unwrap();
    let proof_id = proof_body["id"].as_str().unwrap().to_string();

    // 8. User 2 reviews and approves the proof
    let review_req = Request::builder()
        .method("POST")
        .uri(format!("/api/proofs/{}/review", proof_id))
        .header("authorization", format!("Bearer {}", user2_token))
        .header("content-type", "application/json")
        .body(Body::from(
            json!({
                "status": "approved",
                "rejectionReason": null
            })
            .to_string(),
        ))
        .unwrap();

    let res_review = app.clone().oneshot(review_req).await.unwrap();
    assert_eq!(res_review.status(), StatusCode::OK);

    // 9. User 1 sends a chat message
    let msg_req = Request::builder()
        .method("POST")
        .uri(format!("/api/messages/{}", match_id))
        .header("authorization", format!("Bearer {}", user1_token))
        .header("content-type", "application/json")
        .body(Body::from(
            json!({
                "content": "Thanks for approving my proof!"
            })
            .to_string(),
        ))
        .unwrap();

    let res_msg = app.clone().oneshot(msg_req).await.unwrap();
    assert_eq!(res_msg.status(), StatusCode::CREATED);

    // 10. User 2 checks notifications
    let notif_req = Request::builder()
        .method("GET")
        .uri("/api/notifications")
        .header("authorization", format!("Bearer {}", user2_token))
        .body(Body::empty())
        .unwrap();

    let res_notif = app.clone().oneshot(notif_req).await.unwrap();
    assert_eq!(res_notif.status(), StatusCode::OK);
}
