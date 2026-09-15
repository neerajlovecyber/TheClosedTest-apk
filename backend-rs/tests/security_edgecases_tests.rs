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

fn unique_test_id() -> String {
    let millis = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap()
        .as_millis();
    let rand_str = &uuid::Uuid::new_v4().to_string()[..8];
    format!("{}_{}", millis, rand_str)
}

async fn drain_status(res: axum::response::Response) -> StatusCode {
    let status = res.status();
    let _ = res.into_body().collect().await;
    status
}

#[tokio::test]
async fn test_security_and_edgecases_suite() {
    let ctx = create_test_context().await;
    assert!(ctx.is_live_db, "Live database required for security edge-case tests");
    let app = app_router().with_state(ctx.state.clone());

    println!("\n[security_suite 1/5] Running RBAC Admin vs Normal User...");
    subtest_security_rbac_admin_vs_normal_user(&app, &ctx).await;

    println!("\n[security_suite 2/5] Running App Ownership & IDOR Protection...");
    subtest_app_ownership_authorization(&app).await;

    println!("\n[security_suite 3/5] Running Match Requests & Peer State Machine...");
    subtest_match_request_security_and_edgecases(&app).await;

    println!("\n[security_suite 4/5] Running Proof Submission Bounds & Review Security...");
    subtest_proof_submission_bounds_and_review_security(&app).await;

    println!("\n[security_suite 5/5] Running Account Deletion & Foreign Key Cascading...");
    subtest_account_deletion_cascades_foreign_keys(&app).await;

    println!("\n[security_suite] All 5 security and edge-case test domains passed successfully!");
}

async fn subtest_security_rbac_admin_vs_normal_user(app: &axum::Router, ctx: &common::TestContext) {
    let run_id = unique_test_id();
    let normal_token = format!("fixture_token_normal_{}", run_id);
    let admin_token = format!("fixture_token_admin_{}", run_id);

    // 1. Sync regular user
    let sync_normal = Request::builder()
        .method("POST")
        .uri("/api/users/sync")
        .header("authorization", format!("Bearer {}", normal_token))
        .header("content-type", "application/json")
        .body(Body::from(
            json!({
                "tokenIdentifier": normal_token,
                "name": "Regular User",
                "email": format!("regular_{}@example.com", run_id),
            })
            .to_string(),
        ))
        .unwrap();
    let res_norm = app.clone().oneshot(sync_normal).await.unwrap();
    assert!(res_norm.status().is_success());

    // 2. Regular user tries GET /api/admin/stats -> 403 Forbidden
    let stats_req = Request::builder()
        .method("GET")
        .uri("/api/admin/stats")
        .header("authorization", format!("Bearer {}", normal_token))
        .body(Body::empty())
        .unwrap();
    let stats_res = app.clone().oneshot(stats_req).await.unwrap();
    assert_eq!(drain_status(stats_res).await, StatusCode::FORBIDDEN, "Non-admin must receive 403 Forbidden for admin stats");

    // 3. Sync admin user with unique email, then grant is_admin in DB
    let admin_email = format!("admin_{}@example.com", run_id);
    let sync_admin = Request::builder()
        .method("POST")
        .uri("/api/users/sync")
        .header("authorization", format!("Bearer {}", admin_token))
        .header("content-type", "application/json")
        .body(Body::from(
            json!({
                "tokenIdentifier": admin_token,
                "name": "Super Admin",
                "email": admin_email,
            })
            .to_string(),
        ))
        .unwrap();
    let res_adm = app.clone().oneshot(sync_admin).await.unwrap();
    assert!(res_adm.status().is_success());
    let adm_body: Value = serde_json::from_slice(&res_adm.into_body().collect().await.unwrap().to_bytes()).unwrap();
    let admin_id = adm_body["id"].as_str().unwrap();

    let _ = sqlx::query("UPDATE users SET is_admin = true WHERE id = $1")
        .bind(admin_id)
        .execute(&ctx.pool)
        .await;
    ctx.state.user_cache.invalidate(&admin_token).await;

    // 4. Admin user calls GET /api/admin/stats -> 200 OK
    let admin_stats_req = Request::builder()
        .method("GET")
        .uri("/api/admin/stats")
        .header("authorization", format!("Bearer {}", admin_token))
        .body(Body::empty())
        .unwrap();
    let admin_stats_res = app.clone().oneshot(admin_stats_req).await.unwrap();
    assert_eq!(admin_stats_res.status(), StatusCode::OK, "Admin user must be allowed to view admin stats");
}

async fn subtest_app_ownership_authorization(app: &axum::Router) {
    let run_id = unique_test_id();
    let user1_token = format!("fixture_token_user1_{}", run_id);
    let user2_token = format!("fixture_token_user2_{}", run_id);

    // Sync User 1 & User 2
    for (tok, name) in [(&user1_token, "Owner"), (&user2_token, "Attacker")] {
        let req = Request::builder()
            .method("POST")
            .uri("/api/users/sync")
            .header("authorization", format!("Bearer {}", tok))
            .header("content-type", "application/json")
            .body(Body::from(
                json!({
                    "tokenIdentifier": tok,
                    "name": name,
                    "email": format!("{}_{}@example.com", name.to_lowercase(), run_id),
                })
                .to_string(),
            ))
            .unwrap();
        let _ = app.clone().oneshot(req).await.unwrap();
    }

    // User 1 creates an app
    let pkg = format!("com.owner.app.{}", run_id);
    let create_req = Request::builder()
        .method("POST")
        .uri("/api/apps")
        .header("authorization", format!("Bearer {}", user1_token))
        .header("content-type", "application/json")
        .body(Body::from(
            json!({
                "title": "Owner Secret App",
                "packageName": pkg,
                "playStoreUrl": format!("https://play.google.com/store/apps/details?id={}", pkg),
                "iconUrl": "https://example.com/icon.png",
                "instructions": "Test my private features carefully.",
                "requiredTesters": 12
            })
            .to_string(),
        ))
        .unwrap();
    let create_res = app.clone().oneshot(create_req).await.unwrap();
    assert_eq!(create_res.status(), StatusCode::OK);
    let create_body: Value = serde_json::from_slice(&create_res.into_body().collect().await.unwrap().to_bytes()).unwrap();
    let app_id = create_body["id"].as_str().unwrap().to_string();

    // User 2 tries to modify User 1's app -> 403 Forbidden
    let patch_req = Request::builder()
        .method("PATCH")
        .uri(format!("/api/apps/{}", app_id))
        .header("authorization", format!("Bearer {}", user2_token))
        .header("content-type", "application/json")
        .body(Body::from(
            json!({
                "title": "Hacked App Title"
            })
            .to_string(),
        ))
        .unwrap();
    let patch_res = app.clone().oneshot(patch_req).await.unwrap();
    assert_eq!(drain_status(patch_res).await, StatusCode::FORBIDDEN, "User 2 must not be allowed to modify User 1's app");

    // User 2 tries to delete User 1's app -> 403 Forbidden
    let del_req = Request::builder()
        .method("DELETE")
        .uri(format!("/api/apps/{}", app_id))
        .header("authorization", format!("Bearer {}", user2_token))
        .body(Body::empty())
        .unwrap();
    let del_res = app.clone().oneshot(del_req).await.unwrap();
    assert_eq!(drain_status(del_res).await, StatusCode::FORBIDDEN, "User 2 must not be allowed to delete User 1's app");
}

async fn subtest_match_request_security_and_edgecases(app: &axum::Router) {
    let run_id = unique_test_id();
    let user1_token = format!("fixture_token_m1_{}", run_id);
    let user2_token = format!("fixture_token_m2_{}", run_id);

    for (tok, name) in [(&user1_token, "Alice"), (&user2_token, "Bob")] {
        let req = Request::builder()
            .method("POST")
            .uri("/api/users/sync")
            .header("authorization", format!("Bearer {}", tok))
            .header("content-type", "application/json")
            .body(Body::from(
                json!({
                    "tokenIdentifier": tok,
                    "name": name,
                    "email": format!("{}_{}@example.com", name.to_lowercase(), run_id),
                })
                .to_string(),
            ))
            .unwrap();
        let _ = app.clone().oneshot(req).await.unwrap();
    }

    // Alice creates App 1
    let pkg1 = format!("com.alice.match.{}", run_id);
    let app1_req = Request::builder()
        .method("POST")
        .uri("/api/apps")
        .header("authorization", format!("Bearer {}", user1_token))
        .header("content-type", "application/json")
        .body(Body::from(
            json!({
                "title": "Alice Match App",
                "packageName": pkg1,
                "playStoreUrl": format!("https://play.google.com/store/apps/details?id={}", pkg1),
                "iconUrl": "https://example.com/icon1.png",
                "instructions": "Test Alice's app.",
                "requiredTesters": 12
            })
            .to_string(),
        ))
        .unwrap();
    let app1_res = app.clone().oneshot(app1_req).await.unwrap();
    let app1_body: Value = serde_json::from_slice(&app1_res.into_body().collect().await.unwrap().to_bytes()).unwrap();
    let app1_id = app1_body["id"].as_str().unwrap().to_string();

    // Bob creates App 2
    let pkg2 = format!("com.bob.match.{}", run_id);
    let app2_req = Request::builder()
        .method("POST")
        .uri("/api/apps")
        .header("authorization", format!("Bearer {}", user2_token))
        .header("content-type", "application/json")
        .body(Body::from(
            json!({
                "title": "Bob Match App",
                "packageName": pkg2,
                "playStoreUrl": format!("https://play.google.com/store/apps/details?id={}", pkg2),
                "iconUrl": "https://example.com/icon2.png",
                "instructions": "Test Bob's app.",
                "requiredTesters": 12
            })
            .to_string(),
        ))
        .unwrap();
    let app2_res = app.clone().oneshot(app2_req).await.unwrap();
    let app2_body: Value = serde_json::from_slice(&app2_res.into_body().collect().await.unwrap().to_bytes()).unwrap();
    let app2_id = app2_body["id"].as_str().unwrap().to_string();

    // Edge case 1: Alice tries to match App 1 with App 1 (Self-match) -> 400 Bad Request
    let self_match_req = Request::builder()
        .method("POST")
        .uri("/api/matches/request")
        .header("authorization", format!("Bearer {}", user1_token))
        .header("content-type", "application/json")
        .body(Body::from(
            json!({
                "myAppId": app1_id,
                "targetAppId": app1_id
            })
            .to_string(),
        ))
        .unwrap();
    let self_res = app.clone().oneshot(self_match_req).await.unwrap();
    assert_eq!(drain_status(self_res).await, StatusCode::BAD_REQUEST, "Self-matching must return 400");

    // Edge case 2: Alice requests match with non-existent app -> 404 Not Found
    let fake_match_req = Request::builder()
        .method("POST")
        .uri("/api/matches/request")
        .header("authorization", format!("Bearer {}", user1_token))
        .header("content-type", "application/json")
        .body(Body::from(
            json!({
                "myAppId": app1_id,
                "targetAppId": "non-existent-app-id-999"
            })
            .to_string(),
        ))
        .unwrap();
    let fake_res = app.clone().oneshot(fake_match_req).await.unwrap();
    assert_eq!(drain_status(fake_res).await, StatusCode::BAD_REQUEST, "Matching non-existent app must return 400");

    // Valid Match: Alice requests match with Bob's App 2 -> 200 OK
    let valid_match_req = Request::builder()
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
    let valid_res = app.clone().oneshot(valid_match_req).await.unwrap();
    assert_eq!(valid_res.status(), StatusCode::OK);
    let valid_body: Value = serde_json::from_slice(&valid_res.into_body().collect().await.unwrap().to_bytes()).unwrap();
    let match_id = valid_body["id"].as_str().unwrap().to_string();

    // Edge case 3: Alice tries to accept her OWN match request -> 403 Forbidden
    let self_accept_req = Request::builder()
        .method("POST")
        .uri(format!("/api/matches/{}/accept", match_id))
        .header("authorization", format!("Bearer {}", user1_token))
        .body(Body::empty())
        .unwrap();
    let self_accept_res = app.clone().oneshot(self_accept_req).await.unwrap();
    assert_eq!(drain_status(self_accept_res).await, StatusCode::FORBIDDEN, "Match initiator must not be allowed to accept their own match");

    // Target User (Bob) accepts match -> 200 OK
    let bob_accept_req = Request::builder()
        .method("POST")
        .uri(format!("/api/matches/{}/accept", match_id))
        .header("authorization", format!("Bearer {}", user2_token))
        .body(Body::empty())
        .unwrap();
    let bob_accept_res = app.clone().oneshot(bob_accept_req).await.unwrap();
    assert_eq!(drain_status(bob_accept_res).await, StatusCode::OK);

    // Edge case 4: Alice tries to request a duplicate match while active -> 400 Bad Request
    let dup_match_req = Request::builder()
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
    let dup_res = app.clone().oneshot(dup_match_req).await.unwrap();
    assert_eq!(drain_status(dup_res).await, StatusCode::BAD_REQUEST, "Duplicate match between active apps must return 400");
}

async fn subtest_proof_submission_bounds_and_review_security(app: &axum::Router) {
    let run_id = unique_test_id();
    let user1_token = format!("fixture_token_p1_{}", run_id);
    let user2_token = format!("fixture_token_p2_{}", run_id);

    for (tok, name) in [(&user1_token, "Uploader"), (&user2_token, "Reviewer")] {
        let req = Request::builder()
            .method("POST")
            .uri("/api/users/sync")
            .header("authorization", format!("Bearer {}", tok))
            .header("content-type", "application/json")
            .body(Body::from(
                json!({
                    "tokenIdentifier": tok,
                    "name": name,
                    "email": format!("{}_{}@example.com", name.to_lowercase(), run_id),
                })
                .to_string(),
            ))
            .unwrap();
        let sync_res = app.clone().oneshot(req).await.unwrap();
        let status = sync_res.status();
        if !status.is_success() {
            let body_bytes = axum::body::to_bytes(sync_res.into_body(), usize::MAX).await.unwrap();
            panic!("Sync must succeed for {}: status={}, body={}", name, status, String::from_utf8_lossy(&body_bytes));
        }
    }

    let pkg1 = format!("com.up.app.{}", run_id);
    let app1_req = Request::builder()
        .method("POST")
        .uri("/api/apps")
        .header("authorization", format!("Bearer {}", user1_token))
        .header("content-type", "application/json")
        .body(Body::from(
            json!({
                "title": "Uploader App",
                "packageName": pkg1,
                "playStoreUrl": format!("https://play.google.com/store/apps/details?id={}", pkg1),
                "iconUrl": "https://example.com/icon1.png",
                "instructions": "Test proof app.",
                "requiredTesters": 12
            })
            .to_string(),
        ))
        .unwrap();
    let app1_res = app.clone().oneshot(app1_req).await.unwrap();
    let app1_body: Value = serde_json::from_slice(&app1_res.into_body().collect().await.unwrap().to_bytes()).unwrap();
    let app1_id = app1_body["id"].as_str().unwrap().to_string();

    let pkg2 = format!("com.rev.app.{}", run_id);
    let app2_req = Request::builder()
        .method("POST")
        .uri("/api/apps")
        .header("authorization", format!("Bearer {}", user2_token))
        .header("content-type", "application/json")
        .body(Body::from(
            json!({
                "title": "Reviewer App",
                "packageName": pkg2,
                "playStoreUrl": format!("https://play.google.com/store/apps/details?id={}", pkg2),
                "iconUrl": "https://example.com/icon2.png",
                "instructions": "Reviewer test app.",
                "requiredTesters": 12
            })
            .to_string(),
        ))
        .unwrap();
    let app2_res = app.clone().oneshot(app2_req).await.unwrap();
    let app2_bytes = app2_res.into_body().collect().await.unwrap().to_bytes();
    let app2_body: Value = serde_json::from_slice(&app2_bytes).unwrap();
    assert_eq!(app2_body.get("id").is_some(), true, "Failed to create app2: {:?}", app2_body);
    let app2_id = app2_body["id"].as_str().unwrap().to_string();

    // Create and activate match
    let m_req = Request::builder()
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
    let m_res = app.clone().oneshot(m_req).await.unwrap();
    let m_body: Value = serde_json::from_slice(&m_res.into_body().collect().await.unwrap().to_bytes()).unwrap();
    let match_id = m_body["id"].as_str().unwrap().to_string();

    let accept = Request::builder()
        .method("POST")
        .uri(format!("/api/matches/{}/accept", match_id))
        .header("authorization", format!("Bearer {}", user2_token))
        .body(Body::empty())
        .unwrap();
    let _ = app.clone().oneshot(accept).await.unwrap();

    // Edge case 1: Day 0 -> 400 Bad Request
    let day0_req = Request::builder()
        .method("POST")
        .uri("/api/proofs")
        .header("authorization", format!("Bearer {}", user1_token))
        .header("content-type", "application/json")
        .body(Body::from(
            json!({
                "matchId": match_id,
                "day": 0,
                "storageUrls": ["https://r2.theclosedtest.com/p0.jpg"]
            })
            .to_string(),
        ))
        .unwrap();
    let day0_res = app.clone().oneshot(day0_req).await.unwrap();
    assert_eq!(drain_status(day0_res).await, StatusCode::BAD_REQUEST, "Proof day < 1 must return 400");

    // Edge case 2: Day 15 -> 400 Bad Request
    let day15_req = Request::builder()
        .method("POST")
        .uri("/api/proofs")
        .header("authorization", format!("Bearer {}", user1_token))
        .header("content-type", "application/json")
        .body(Body::from(
            json!({
                "matchId": match_id,
                "day": 15,
                "storageUrls": ["https://r2.theclosedtest.com/p15.jpg"]
            })
            .to_string(),
        ))
        .unwrap();
    let day15_res = app.clone().oneshot(day15_req).await.unwrap();
    assert_eq!(drain_status(day15_res).await, StatusCode::BAD_REQUEST, "Proof day > 14 must return 400");

    // Valid Proof: Day 1
    let proof_req = Request::builder()
        .method("POST")
        .uri("/api/proofs")
        .header("authorization", format!("Bearer {}", user1_token))
        .header("content-type", "application/json")
        .body(Body::from(
            json!({
                "matchId": match_id,
                "day": 1,
                "storageUrls": ["https://r2.theclosedtest.com/p1.jpg"],
                "comment": "Day 1 done"
            })
            .to_string(),
        ))
        .unwrap();
    let proof_res = app.clone().oneshot(proof_req).await.unwrap();
    assert_eq!(proof_res.status(), StatusCode::OK);
    let proof_body: Value = serde_json::from_slice(&proof_res.into_body().collect().await.unwrap().to_bytes()).unwrap();
    let proof_id = proof_body["id"].as_str().unwrap().to_string();

    // Edge case 3: User 1 tries to review / approve their OWN proof -> 403 Forbidden
    let self_review_req = Request::builder()
        .method("POST")
        .uri(format!("/api/proofs/{}/review", proof_id))
        .header("authorization", format!("Bearer {}", user1_token))
        .header("content-type", "application/json")
        .body(Body::from(
            json!({
                "status": "approved"
            })
            .to_string(),
        ))
        .unwrap();
    let self_review_res = app.clone().oneshot(self_review_req).await.unwrap();
    assert_eq!(drain_status(self_review_res).await, StatusCode::FORBIDDEN, "Uploader cannot review their own proof");

    // Reviewer (User 2) rejects proof with feedback reason -> 200 OK
    let review_req = Request::builder()
        .method("POST")
        .uri(format!("/api/proofs/{}/review", proof_id))
        .header("authorization", format!("Bearer {}", user2_token))
        .header("content-type", "application/json")
        .body(Body::from(
            json!({
                "status": "rejected",
                "rejectionReason": "Screenshot is too blurry and not from today."
            })
            .to_string(),
        ))
        .unwrap();
    let review_res = app.clone().oneshot(review_req).await.unwrap();
    assert_eq!(review_res.status(), StatusCode::OK);
    let review_body: Value = serde_json::from_slice(&review_res.into_body().collect().await.unwrap().to_bytes()).unwrap();
    assert_eq!(review_body["status"], "rejected");
    assert_eq!(review_body["rejectionReason"], "Screenshot is too blurry and not from today.");
}

async fn subtest_account_deletion_cascades_foreign_keys(app: &axum::Router) {
    let run_id = unique_test_id();
    let temp_user_token = format!("fixture_token_temp_{}", run_id);

    // 1. Sync temporary user
    let sync_req = Request::builder()
        .method("POST")
        .uri("/api/users/sync")
        .header("authorization", format!("Bearer {}", temp_user_token))
        .header("content-type", "application/json")
        .body(Body::from(
            json!({
                "tokenIdentifier": temp_user_token,
                "name": "Temp Delete User",
                "email": format!("temp_{}@example.com", run_id),
            })
            .to_string(),
        ))
        .unwrap();
    let sync_res = app.clone().oneshot(sync_req).await.unwrap();
    assert!(sync_res.status().is_success());

    // 2. Create an app for temp user
    let pkg = format!("com.temp.delete.{}", run_id);
    let app_req = Request::builder()
        .method("POST")
        .uri("/api/apps")
        .header("authorization", format!("Bearer {}", temp_user_token))
        .header("content-type", "application/json")
        .body(Body::from(
            json!({
                "title": "Temp App to Delete",
                "packageName": pkg,
                "playStoreUrl": format!("https://play.google.com/store/apps/details?id={}", pkg),
                "iconUrl": "https://example.com/icon.png",
                "instructions": "Will be deleted with account.",
                "requiredTesters": 12
            })
            .to_string(),
        ))
        .unwrap();
    let app_res = app.clone().oneshot(app_req).await.unwrap();
    assert_eq!(app_res.status(), StatusCode::OK);
    let app_body: Value = serde_json::from_slice(&app_res.into_body().collect().await.unwrap().to_bytes()).unwrap();
    let app_id = app_body["id"].as_str().unwrap().to_string();

    // 3. User calls DELETE /api/users/me -> 200 OK
    let del_acc_req = Request::builder()
        .method("DELETE")
        .uri("/api/users/me")
        .header("authorization", format!("Bearer {}", temp_user_token))
        .body(Body::empty())
        .unwrap();
    let del_acc_res = app.clone().oneshot(del_acc_req).await.unwrap();
    assert_eq!(del_acc_res.status(), StatusCode::OK, "Account deletion must succeed with cascade");

    // 4. Verify app is no longer found (cascaded by DB ON DELETE CASCADE)
    let get_app_req = Request::builder()
        .method("GET")
        .uri(format!("/api/apps/{}", app_id))
        .body(Body::empty())
        .unwrap();
    let get_app_res = app.clone().oneshot(get_app_req).await.unwrap();
    assert_eq!(get_app_res.status(), StatusCode::NOT_FOUND, "Cascaded app should not exist after user deletion");
}
