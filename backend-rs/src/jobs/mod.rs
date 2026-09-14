use std::time::Duration;
use sqlx::PgPool;
use tracing::info;
use uuid::Uuid;

use crate::services::push::send_push_notification;

// 1. Reset inactive streaks (> 48 hours without check-in)
pub async fn run_daily_streak_maintenance(pool: &PgPool) -> Result<(), sqlx::Error> {
    info!("🌙 Running daily streak maintenance...");
    let res = sqlx::query(
        r#"
        UPDATE users
        SET streak = 0, updated_at = NOW()
        WHERE streak > 0
          AND last_check_in_date IS NOT NULL
          AND TO_DATE(last_check_in_date, 'YYYY-MM-DD') < CURRENT_DATE - INTERVAL '1 DAY'
        "#,
    )
    .execute(pool)
    .await?;

    if res.rows_affected() > 0 {
        info!("Reset {} inactive user streaks to 0", res.rows_affected());
    }
    Ok(())
}

// 2. Match progression, auto-completion, abandonment, warnings, and app auto-pausing
pub async fn run_match_progression_and_cleanup(pool: &PgPool) -> Result<(), sqlx::Error> {
    info!("🔄 Running match progression and cleanup checks...");

    // 2a. Auto-complete 14-day matches (or matches active 15+ days)
    // Day 15 auto-approves pending proofs and completes match
    let fifteen_days_active = sqlx::query_as::<_, (String, String, String, i32, i32)>(
        r#"
        SELECT id, user1_id, user2_id, user1_approved_count, user2_approved_count
        FROM matches
        WHERE status = 'active'
          AND start_date <= NOW() - INTERVAL '14 DAYS'
        "#,
    )
    .fetch_all(pool)
    .await?;

    for (match_id, u1_id, u2_id, u1_appr, u2_appr) in fifteen_days_active {
        // Auto approve any pending proofs
        let pending_u1: (i64,) = sqlx::query_as("SELECT COUNT(*)::bigint FROM proofs WHERE match_id = $1 AND uploader_id = $2 AND status = 'pending'")
            .bind(&match_id)
            .bind(&u1_id)
            .fetch_one(pool)
            .await?;

        let pending_u2: (i64,) = sqlx::query_as("SELECT COUNT(*)::bigint FROM proofs WHERE match_id = $1 AND uploader_id = $2 AND status = 'pending'")
            .bind(&match_id)
            .bind(&u2_id)
            .fetch_one(pool)
            .await?;

        let _ = sqlx::query("UPDATE proofs SET status = 'approved', reviewed_at = NOW() WHERE match_id = $1 AND status = 'pending'")
            .bind(&match_id)
            .execute(pool)
            .await;

        let _ = sqlx::query(
            "UPDATE matches SET status = 'completed', user1_approved_count = $1, user2_approved_count = $2, completed_at = NOW(), updated_at = NOW() WHERE id = $3",
        )
        .bind(u1_appr + pending_u1.0 as i32)
        .bind(u2_appr + pending_u2.0 as i32)
        .bind(&match_id)
        .execute(pool)
        .await;

        // Reward +20 reputation
        let _ = sqlx::query("UPDATE users SET reputation = reputation + 20 WHERE id = $1 OR id = $2")
            .bind(&u1_id)
            .bind(&u2_id)
            .execute(pool)
            .await;
    }

    // 2b. Cancel matches where user has been inactive for > 72 hours (3 days), but ONLY if match started > 48 hours ago
    let abandoned_matches = sqlx::query_as::<_, (String, String, String)>(
        r#"
        SELECT m.id, m.user1_id, m.user2_id
        FROM matches m
        WHERE m.status = 'active'
          AND m.start_date <= NOW() - INTERVAL '72 HOURS'
          AND m.last_activity <= NOW() - INTERVAL '72 HOURS'
        "#,
    )
    .fetch_all(pool)
    .await?;

    for (match_id, u1_id, u2_id) in abandoned_matches {
        // Check which user was inactive
        let u1_recent: (i64,) = sqlx::query_as("SELECT COUNT(*)::bigint FROM proofs WHERE match_id = $1 AND uploader_id = $2 AND submitted_at >= NOW() - INTERVAL '72 HOURS'")
            .bind(&match_id)
            .bind(&u1_id)
            .fetch_one(pool)
            .await?;

        let u2_recent: (i64,) = sqlx::query_as("SELECT COUNT(*)::bigint FROM proofs WHERE match_id = $1 AND uploader_id = $2 AND submitted_at >= NOW() - INTERVAL '72 HOURS'")
            .bind(&match_id)
            .bind(&u2_id)
            .fetch_one(pool)
            .await?;

        let _ = sqlx::query("UPDATE matches SET status = 'cancelled', updated_at = NOW() WHERE id = $1")
            .bind(&match_id)
            .execute(pool)
            .await;

        if u1_recent.0 == 0 && u2_recent.0 > 0 {
            // User 1 inactive: penalize user 1
            let _ = sqlx::query("UPDATE users SET reputation = GREATEST(0, reputation - 10), streak = 0 WHERE id = $1").bind(&u1_id).execute(pool).await;
        } else if u2_recent.0 == 0 && u1_recent.0 > 0 {
            // User 2 inactive: penalize user 2
            let _ = sqlx::query("UPDATE users SET reputation = GREATEST(0, reputation - 10), streak = 0 WHERE id = $1").bind(&u2_id).execute(pool).await;
        } else if u1_recent.0 == 0 && u2_recent.0 == 0 {
            // Both inactive: penalize both
            let _ = sqlx::query("UPDATE users SET reputation = GREATEST(0, reputation - 10), streak = 0 WHERE id = $1 OR id = $2").bind(&u1_id).bind(&u2_id).execute(pool).await;
        }
    }

    // 2c. Send 48-hour urgent inactivity warning to active matches
    let warning_matches = sqlx::query_as::<_, (String, String, String)>(
        r#"
        SELECT m.id, m.user1_id, m.user2_id
        FROM matches m
        WHERE m.status = 'active'
          AND m.start_date <= NOW() - INTERVAL '48 HOURS'
          AND m.last_activity <= NOW() - INTERVAL '48 HOURS'
          AND m.last_activity > NOW() - INTERVAL '72 HOURS'
        "#,
    )
    .fetch_all(pool)
    .await?;

    for (match_id, _u1_id, u2_id) in warning_matches {
        let notif_id = Uuid::new_v4().to_string();
        let notif_data = serde_json::json!({ "matchId": match_id, "subtype": "inactivity_warning" });
        let _ = sqlx::query(
            "INSERT INTO notifications (id, user_id, type, title, body, data, read, created_at) VALUES ($1, $2, 'reminder', '⚠️ Urgent: Testing Match In Danger', 'Please upload proof within 24 hours to prevent match cancellation.', $3, false, NOW())",
        )
        .bind(notif_id)
        .bind(&u2_id)
        .bind(notif_data)
        .execute(pool)
        .await;
    }

    // 2d. Auto-expire stale pending match requests older than 3 days (72 hours)
    let _ = sqlx::query(
        "UPDATE matches SET status = 'cancelled', updated_at = NOW() WHERE status = 'pending' AND created_at < NOW() - INTERVAL '72 HOURS'",
    )
    .execute(pool)
    .await;

    // 2e. Auto-pause recruiting apps when owner is inactive for 72 hours
    let _ = sqlx::query(
        r#"
        UPDATE apps a
        SET status = 'paused', updated_at = NOW()
        FROM users u
        WHERE a.user_id = u.id
          AND a.status = 'recruiting'
          AND u.updated_at < NOW() - INTERVAL '72 HOURS'
        "#,
    )
    .execute(pool)
    .await;

    Ok(())
}

// 3. Delete notifications older than 7 days
pub async fn run_notification_cleanup(pool: &PgPool) -> Result<(), sqlx::Error> {
    info!("🧹 Cleaning notifications older than 7 days...");
    let res = sqlx::query("DELETE FROM notifications WHERE created_at < NOW() - INTERVAL '7 DAYS'")
        .execute(pool)
        .await?;
    info!("Deleted {} old notifications", res.rows_affected());
    Ok(())
}

// 4. Delete expired temporary bans
pub async fn run_expired_bans_cleanup(pool: &PgPool) -> Result<(), sqlx::Error> {
    info!("🧹 Cleaning expired temporary bans...");
    let res = sqlx::query("DELETE FROM user_bans WHERE permanent = false AND expires_at <= NOW()")
        .execute(pool)
        .await?;
    info!("Deleted {} expired temporary bans", res.rows_affected());
    Ok(())
}

// 5. Archive matches completed or cancelled > 60 days ago
pub async fn run_old_matches_cleanup(pool: &PgPool) -> Result<(), sqlx::Error> {
    info!("🧹 Archiving matches completed or cancelled > 60 days ago...");
    let res = sqlx::query(
        "UPDATE matches SET status = 'archived', updated_at = NOW() WHERE status IN ('completed', 'cancelled') AND updated_at < NOW() - INTERVAL '60 DAYS'",
    )
    .execute(pool)
    .await?;
    info!("Archived {} old matches", res.rows_affected());
    Ok(())
}

// 6. Inactive match daily reminders
pub async fn run_daily_testing_reminders(pool: &PgPool, http_client: &reqwest::Client) -> Result<(), sqlx::Error> {
    info!("🔔 Sending daily testing reminders...");
    let inactive_matches: Vec<(String, String, String, Option<String>, Option<String>)> = sqlx::query_as(
        r#"
        SELECT m.id, m.user1_id, m.user2_id, u1.push_token, u2.push_token
        FROM matches m
        JOIN users u1 ON m.user1_id = u1.id
        JOIN users u2 ON m.user2_id = u2.id
        WHERE m.status = 'active'
          AND m.last_activity < NOW() - INTERVAL '24 HOURS'
        LIMIT 50
        "#,
    )
    .fetch_all(pool)
    .await?;

    for (match_id, u1_id, u2_id, u1_token, u2_token) in inactive_matches {
        let notif_id1 = Uuid::new_v4().to_string();
        let data1 = serde_json::json!({ "matchId": match_id });
        let _ = sqlx::query(
            "INSERT INTO notifications (id, user_id, type, title, body, data, read, created_at) VALUES ($1, $2, 'reminder', 'Daily Testing Reminder', 'Remember to open your partner\\'s app and test today!', $3, false, NOW())",
        )
        .bind(notif_id1)
        .bind(&u1_id)
        .bind(&data1)
        .execute(pool)
        .await;

        if let Some(token) = u1_token {
            send_push_notification(
                http_client,
                &token,
                "Daily Testing Reminder".to_string(),
                "Remember to open your partner's app and test today!".to_string(),
                data1,
            ).await;
        }

        let notif_id2 = Uuid::new_v4().to_string();
        let data2 = serde_json::json!({ "matchId": match_id });
        let _ = sqlx::query(
            "INSERT INTO notifications (id, user_id, type, title, body, data, read, created_at) VALUES ($1, $2, 'reminder', 'Daily Testing Reminder', 'Remember to open your partner\\'s app and test today!', $3, false, NOW())",
        )
        .bind(notif_id2)
        .bind(&u2_id)
        .bind(&data2)
        .execute(pool)
        .await;

        if let Some(token) = u2_token {
            send_push_notification(
                http_client,
                &token,
                "Daily Testing Reminder".to_string(),
                "Remember to open your partner's app and test today!".to_string(),
                data2,
            ).await;
        }
    }
    Ok(())
}

pub fn start_background_jobs(pool: PgPool, http_client: reqwest::Client) {
    tokio::spawn(async move {
        info!("⏰ Background maintenance worker started (first run in 6 hours)");
        let period = Duration::from_secs(6 * 3600);
        // interval_at delays the FIRST tick by `period`, preventing notifications
        // from firing on every deploy/restart
        let start = tokio::time::Instant::now() + period;
        let mut interval = tokio::time::interval_at(start, period);

        loop {
            interval.tick().await;
            info!("🔄 Running scheduled maintenance jobs...");
            let _ = run_daily_streak_maintenance(&pool).await;
            let _ = run_match_progression_and_cleanup(&pool).await;
            let _ = run_notification_cleanup(&pool).await;
            let _ = run_expired_bans_cleanup(&pool).await;
            let _ = run_old_matches_cleanup(&pool).await;
            let _ = run_daily_testing_reminders(&pool, &http_client).await;
        }
    });
}
