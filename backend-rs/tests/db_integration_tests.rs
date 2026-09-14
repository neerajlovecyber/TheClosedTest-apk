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
    assert!(ctx.is_live_db, "TEST_DATABASE_URL or live database connection is required for db_integration_tests");

    let app = app_router().with_state(ctx.state);

    let run_id = uuid::Uuid::new_v4().to_string()[..8].to_string();
    let user1_token = format!("fixture_token_user_1_{}", run_id);
    let user2_token = format!("fixture_token_user_2_{}", run_id);
    let user1_email = format!("alice_{}@example.com", run_id);
    let user2_email = format!("bob_{}@example.com", run_id);

    println!("[step 1] User 1 sync...");
    let sync_req = Request::builder()
        .method("POST")
        .uri("/api/users/sync")
        .header("authorization", format!("Bearer {}", user1_token))
        .header("content-type", "application/json")
        .body(Body::from(
            json!({
                "tokenIdentifier": user1_token,
                "name": "Developer Alice",
                "email": user1_email,
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
    println!("[step 1 done] User 1 synced: id={}", _user1_id);

    // 2. User 2 Sync
    println!("[step 2] User 2 sync...");
    let sync_req2 = Request::builder()
        .method("POST")
        .uri("/api/users/sync")
        .header("authorization", format!("Bearer {}", user2_token))
        .header("content-type", "application/json")
        .body(Body::from(
            json!({
                "tokenIdentifier": user2_token,
                "name": "Developer Bob",
                "email": user2_email,
            })
            .to_string(),
        ))
        .unwrap();

    let res2 = app.clone().oneshot(sync_req2).await.unwrap();
    assert!(res2.status() == StatusCode::OK || res2.status() == StatusCode::CREATED);
    let body2: Value = serde_json::from_slice(&res2.into_body().collect().await.unwrap().to_bytes()).unwrap();
    let _user2_id = body2["id"].as_str().unwrap().to_string();
    assert_eq!(body2["name"], "Developer Bob");
    println!("[step 2 done] User 2 synced: id={}", _user2_id);

    let run_id = uuid::Uuid::new_v4().to_string()[..8].to_string();
    let pkg1 = format!("com.alice.productivity.{}", run_id);
    let pkg2 = format!("com.bob.fitness.{}", run_id);

    // 3. User 1 creates App 1
    println!("[step 3] User 1 create App 1...");
    let app1_req = Request::builder()
        .method("POST")
        .uri("/api/apps")
        .header("authorization", format!("Bearer {}", user1_token))
        .header("content-type", "application/json")
        .body(Body::from(
            json!({
                "title": "Alice Productivity Tool",
                "packageName": pkg1,
                "playStoreUrl": format!("https://play.google.com/store/apps/details?id={}", pkg1),
                "iconUrl": "https://example.com/icon1.png",
                "instructions": "Open the app daily and test productivity tracking.",
                "requiredTesters": 12
            })
            .to_string(),
        ))
        .unwrap();

    let res_app1 = app.clone().oneshot(app1_req).await.unwrap();
    assert_eq!(res_app1.status(), StatusCode::OK);
    let app1_body: Value = serde_json::from_slice(&res_app1.into_body().collect().await.unwrap().to_bytes()).unwrap();
    let app1_id = app1_body["id"].as_str().unwrap().to_string();
    println!("[step 3 done] App 1 created: id={}", app1_id);

    // 4. User 2 creates App 2
    println!("[step 4] User 2 create App 2...");
    let app2_req = Request::builder()
        .method("POST")
        .uri("/api/apps")
        .header("authorization", format!("Bearer {}", user2_token))
        .header("content-type", "application/json")
        .body(Body::from(
            json!({
                "title": "Bob Fitness Tracker",
                "packageName": pkg2,
                "playStoreUrl": format!("https://play.google.com/store/apps/details?id={}", pkg2),
                "iconUrl": "https://example.com/icon2.png",
                "instructions": "Log workouts and verify that step counters sync.",
                "requiredTesters": 12
            })
            .to_string(),
        ))
        .unwrap();

    let res_app2 = app.clone().oneshot(app2_req).await.unwrap();
    assert_eq!(res_app2.status(), StatusCode::OK);
    let app2_body: Value = serde_json::from_slice(&res_app2.into_body().collect().await.unwrap().to_bytes()).unwrap();
    let app2_id = app2_body["id"].as_str().unwrap().to_string();
    println!("[step 4 done] App 2 created: id={}", app2_id);

    // 5. User 1 requests match between App 1 and App 2
    println!("[step 5] Request match...");
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
    assert_eq!(res_match.status(), StatusCode::OK);
    let match_body: Value = serde_json::from_slice(&res_match.into_body().collect().await.unwrap().to_bytes()).unwrap();
    let match_id = match_body["id"].as_str().unwrap().to_string();
    assert_eq!(match_body["status"], "pending");
    println!("[step 5 done] Match requested: id={}", match_id);

    // 6. User 2 accepts the match
    println!("[step 6] User 2 accept match...");
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
    println!("[step 6 done] Match accepted!");

    // 7. User 1 submits proof for Day 1
    println!("[step 7] User 1 submit proof...");
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
    assert_eq!(res_proof.status(), StatusCode::OK);
    let proof_body: Value = serde_json::from_slice(&res_proof.into_body().collect().await.unwrap().to_bytes()).unwrap();
    let proof_id = proof_body["id"].as_str().unwrap().to_string();
    println!("[step 7 done] Proof submitted: id={}", proof_id);

    // 8. User 2 reviews and approves the proof
    println!("[step 8] User 2 review proof...");
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
    println!("[step 8 done] Proof reviewed!");

    // 9. User 1 sends a chat message
    println!("[step 9] User 1 send message...");
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
    assert_eq!(res_msg.status(), StatusCode::OK);
    println!("[step 9 done] Message sent!");

    // 10. User 2 checks notifications
    println!("[step 10] User 2 check notifications...");
    let notif_req = Request::builder()
        .method("GET")
        .uri("/api/notifications")
        .header("authorization", format!("Bearer {}", user2_token))
        .body(Body::empty())
        .unwrap();

    let res_notif = app.clone().oneshot(notif_req).await.unwrap();
    assert_eq!(res_notif.status(), StatusCode::OK);
    println!("[step 10 done] Notifications retrieved successfully!");

    // 11. Verify Marketplace Badge query: GET /api/matches?status=all
    println!("[step 11] Verify matches query with ?status=all for marketplace badges...");
    let matches_all_req = Request::builder()
        .method("GET")
        .uri("/api/matches?status=all")
        .header("authorization", format!("Bearer {}", user1_token))
        .body(Body::empty())
        .unwrap();

    let res_matches = app.clone().oneshot(matches_all_req).await.unwrap();
    assert_eq!(res_matches.status(), StatusCode::OK);
    let matches_list: Value = serde_json::from_slice(&res_matches.into_body().collect().await.unwrap().to_bytes()).unwrap();
    let matches_arr = matches_list.as_array().expect("matches list should be an array");
    let found = matches_arr.iter().any(|m| m["id"].as_str() == Some(&match_id) && m["status"].as_str() == Some("active"));
    assert!(found, "Active match must be returned in GET /api/matches?status=all for marketplace badges!");
    println!("[step 11 done] Marketplace badge query verified successfully with live DB!");
}
