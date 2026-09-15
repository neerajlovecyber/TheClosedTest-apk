use chrono_tz::Asia::Kolkata;
use cron_tab::AsyncCron;
use sqlx::PgPool;
use tracing::{info, warn};
use uuid::Uuid;

use crate::services::push::send_push_notification;

// ── Advisory lock IDs (must match backend/src/jobs/constants.ts) ─────────────
const LOCK_DAILY_STREAK: i64 = 1001;
const LOCK_MATCH_MAINTENANCE: i64 = 1002;
const LOCK_DAILY_REMINDERS: i64 = 1003;
const LOCK_DB_CLEANUP: i64 = 1004;
const LOCK_BOOT_CLEANUP: i64 = 1005;

// ── PG advisory lock helper ───────────────────────────────────────────────────

/// Try to acquire a PostgreSQL session-level advisory lock, run `task`, then
/// release it.  If another instance holds the lock, logs a skip and returns.
/// On lock-management failure, falls back to running the task directly
/// (matching TS behavior in constants.ts).
async fn with_advisory_lock<F, Fut>(pool: &PgPool, lock_id: i64, name: &str, task: F)
where
    F: FnOnce() -> Fut,
    Fut: std::future::Future<Output = Result<(), sqlx::Error>>,
{
    let mut conn = match pool.acquire().await {
        Ok(c) => c,
        Err(e) => {
            warn!("❌ Failed to acquire DB connection for '{}': {} — running directly", name, e);
            let _ = task().await;
            return;
        }
    };

    let acquired: Result<(bool,), _> = sqlx::query_as("SELECT pg_try_advisory_lock($1)")
        .bind(lock_id)
        .fetch_one(&mut *conn)
        .await;

    match acquired {
        Ok((true,)) => {
            let result = task().await;
            let _ = sqlx::query("SELECT pg_advisory_unlock($1)")
                .bind(lock_id)
                .execute(&mut *conn)
                .await;
            if let Err(e) = result {
                warn!("❌ Job '{}' failed: {}", name, e);
            }
        }
        Ok((false,)) => {
            info!("🔒 Skipping '{}': another instance holds the advisory lock", name);
        }
        Err(e) => {
            warn!("❌ Advisory lock error for '{}': {} — running directly", name, e);
            let _ = task().await;
        }
    }
}

// ── Individual job implementations ────────────────────────────────────────────

/// 1. Midnight IST — Reset inactive streaks (> 1 day without check-in)
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

/// 2a. Auto-complete 14-day matches (day 15+ auto-approves proofs)
/// 2b. Cancel matches inactive for > 72 hours (started > 48h ago)
/// 2c. Send 48-hour inactivity warning
/// 2d. Auto-expire stale pending match requests (> 72h old)
/// 2e. Auto-pause recruiting apps when owner inactive 72h
pub async fn run_match_progression_and_cleanup(pool: &PgPool) -> Result<(), sqlx::Error> {
    info!("🔄 Running match progression and cleanup checks...");

    // 2a. Auto-complete 14-day matches
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
        let pending_u1: (i64,) = sqlx::query_as("SELECT COUNT(*)::bigint FROM proofs WHERE match_id = $1 AND uploader_id = $2 AND status = 'pending'")
            .bind(&match_id).bind(&u1_id).fetch_one(pool).await?;
        let pending_u2: (i64,) = sqlx::query_as("SELECT COUNT(*)::bigint FROM proofs WHERE match_id = $1 AND uploader_id = $2 AND status = 'pending'")
            .bind(&match_id).bind(&u2_id).fetch_one(pool).await?;

        let _ = sqlx::query("UPDATE proofs SET status = 'approved', reviewed_at = NOW() WHERE match_id = $1 AND status = 'pending'")
            .bind(&match_id).execute(pool).await;
        let _ = sqlx::query(
            "UPDATE matches SET status = 'completed', user1_approved_count = $1, user2_approved_count = $2, completed_at = NOW(), updated_at = NOW() WHERE id = $3",
        )
        .bind(u1_appr + pending_u1.0 as i32)
        .bind(u2_appr + pending_u2.0 as i32)
        .bind(&match_id)
        .execute(pool)
        .await;
        let _ = sqlx::query("UPDATE users SET reputation = reputation + 20 WHERE id = $1 OR id = $2")
            .bind(&u1_id).bind(&u2_id).execute(pool).await;
    }

    // 2b. Cancel matches inactive > 72h (started > 48h ago)
    let abandoned = sqlx::query_as::<_, (String, String, String)>(
        r#"
        SELECT m.id, m.user1_id, m.user2_id FROM matches m
        WHERE m.status = 'active'
          AND m.start_date <= NOW() - INTERVAL '72 HOURS'
          AND m.last_activity <= NOW() - INTERVAL '72 HOURS'
        "#,
    )
    .fetch_all(pool)
    .await?;

    for (match_id, u1_id, u2_id) in abandoned {
        let u1_recent: (i64,) = sqlx::query_as("SELECT COUNT(*)::bigint FROM proofs WHERE match_id = $1 AND uploader_id = $2 AND submitted_at >= NOW() - INTERVAL '72 HOURS'")
            .bind(&match_id).bind(&u1_id).fetch_one(pool).await?;
        let u2_recent: (i64,) = sqlx::query_as("SELECT COUNT(*)::bigint FROM proofs WHERE match_id = $1 AND uploader_id = $2 AND submitted_at >= NOW() - INTERVAL '72 HOURS'")
            .bind(&match_id).bind(&u2_id).fetch_one(pool).await?;
        let _ = sqlx::query("UPDATE matches SET status = 'cancelled', updated_at = NOW() WHERE id = $1")
            .bind(&match_id).execute(pool).await;
        if u1_recent.0 == 0 && u2_recent.0 > 0 {
            let _ = sqlx::query("UPDATE users SET reputation = GREATEST(0, reputation - 10), streak = 0 WHERE id = $1").bind(&u1_id).execute(pool).await;
        } else if u2_recent.0 == 0 && u1_recent.0 > 0 {
            let _ = sqlx::query("UPDATE users SET reputation = GREATEST(0, reputation - 10), streak = 0 WHERE id = $1").bind(&u2_id).execute(pool).await;
        } else if u1_recent.0 == 0 && u2_recent.0 == 0 {
            let _ = sqlx::query("UPDATE users SET reputation = GREATEST(0, reputation - 10), streak = 0 WHERE id = $1 OR id = $2").bind(&u1_id).bind(&u2_id).execute(pool).await;
        }
    }

    // 2c. 48h inactivity warning
    let warning_matches = sqlx::query_as::<_, (String, String, String)>(
        r#"
        SELECT m.id, m.user1_id, m.user2_id FROM matches m
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
        .bind(notif_id).bind(&u2_id).bind(notif_data).execute(pool).await;
    }

    // 2d. Expire stale pending match requests > 72h
    let _ = sqlx::query(
        "UPDATE matches SET status = 'cancelled', updated_at = NOW() WHERE status = 'pending' AND created_at < NOW() - INTERVAL '72 HOURS'",
    )
    .execute(pool)
    .await;

    // 2e. Auto-pause apps of inactive owners (72h)
    let _ = sqlx::query(
        r#"
        UPDATE apps a SET status = 'paused', updated_at = NOW()
        FROM users u WHERE a.user_id = u.id
          AND a.status = 'recruiting'
          AND u.updated_at < NOW() - INTERVAL '72 HOURS'
        "#,
    )
    .execute(pool)
    .await;

    Ok(())
}

/// 3. Nightly — Delete notifications older than 7 days
pub async fn run_notification_cleanup(pool: &PgPool) -> Result<(), sqlx::Error> {
    info!("🧹 Cleaning notifications older than 7 days...");
    let res = sqlx::query("DELETE FROM notifications WHERE created_at < NOW() - INTERVAL '7 DAYS'")
        .execute(pool)
        .await?;
    info!("Deleted {} old notifications", res.rows_affected());
    Ok(())
}

/// 4. Nightly — Delete expired temporary bans
pub async fn run_expired_bans_cleanup(pool: &PgPool) -> Result<(), sqlx::Error> {
    info!("🧹 Cleaning expired temporary bans...");
    let res = sqlx::query("DELETE FROM user_bans WHERE permanent = false AND expires_at <= NOW()")
        .execute(pool)
        .await?;
    info!("Deleted {} expired temporary bans", res.rows_affected());
    Ok(())
}

/// 5. Nightly — Archive matches completed/cancelled > 60 days ago
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

/// 6. Nightly — Delete reputation logs older than 60 days
pub async fn run_reputation_logs_cleanup(pool: &PgPool) -> Result<(), sqlx::Error> {
    info!("🧹 Cleaning reputation logs older than 60 days...");
    let res = sqlx::query("DELETE FROM reputation_logs WHERE created_at < NOW() - INTERVAL '60 DAYS'")
        .execute(pool)
        .await?;
    info!("Deleted {} old reputation logs", res.rows_affected());
    Ok(())
}

type InactiveMatchReminder = (String, String, String, Option<String>, Option<String>);

/// 6. 10am/3pm/8pm IST — Send daily push reminders for inactive matches
pub async fn run_daily_testing_reminders(pool: &PgPool, http_client: &reqwest::Client) -> Result<(), sqlx::Error> {
    info!("🔔 Sending daily testing reminders...");
    let inactive_matches: Vec<InactiveMatchReminder> = sqlx::query_as(
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
        let data1 = serde_json::json!({ "matchId": match_id });
        let notif_id1 = Uuid::new_v4().to_string();
        let _ = sqlx::query(
            "INSERT INTO notifications (id, user_id, type, title, body, data, read, created_at) VALUES ($1, $2, 'reminder', 'Daily Testing Reminder', 'Remember to open your partner''s app and test today!', $3, false, NOW())",
        )
        .bind(notif_id1).bind(&u1_id).bind(&data1).execute(pool).await;
        if let Some(token) = u1_token {
            send_push_notification(http_client, &token, "Daily Testing Reminder".to_string(), "Remember to open your partner's app and test today!".to_string(), data1).await;
        }

        let data2 = serde_json::json!({ "matchId": match_id });
        let notif_id2 = Uuid::new_v4().to_string();
        let _ = sqlx::query(
            "INSERT INTO notifications (id, user_id, type, title, body, data, read, created_at) VALUES ($1, $2, 'reminder', 'Daily Testing Reminder', 'Remember to open your partner''s app and test today!', $3, false, NOW())",
        )
        .bind(notif_id2).bind(&u2_id).bind(&data2).execute(pool).await;
        if let Some(token) = u2_token {
            send_push_notification(http_client, &token, "Daily Testing Reminder".to_string(), "Remember to open your partner's app and test today!".to_string(), data2).await;
        }
    }
    Ok(())
}

// ── Cron scheduler ────────────────────────────────────────────────────────────

pub fn start_background_jobs(pool: PgPool, http_client: reqwest::Client) {
    tokio::spawn(async move {
        info!("🚀 Initializing cron_tab schedulers (Asia/Kolkata timezone)...");

        // Boot cleanup — safe housekeeping only, NO push notifications, NO match progression
        {
            let p = pool.clone();
            with_advisory_lock(&p, LOCK_BOOT_CLEANUP, "Boot Cleanup", || async {
                run_notification_cleanup(&p).await?;
                run_expired_bans_cleanup(&p).await?;
                run_old_matches_cleanup(&p).await?;
                Ok(())
            }).await;
        }

        let mut cron = AsyncCron::new(Kolkata);

        // 1. Midnight IST — streak maintenance
        {
            let p = pool.clone();
            cron.add_fn("0 0 0 * * * *", move || {
                let p = p.clone();
                async move {
                    with_advisory_lock(&p, LOCK_DAILY_STREAK, "Daily Streak Maintenance", || {
                        let p = p.clone();
                        async move { run_daily_streak_maintenance(&p).await }
                    }).await;
                }
            }).await.expect("Failed to schedule daily-streak job");
        }

        // 2. 12:10 AM IST — match progression + expired bans
        {
            let p = pool.clone();
            cron.add_fn("0 10 0 * * * *", move || {
                let p = p.clone();
                async move {
                    with_advisory_lock(&p, LOCK_MATCH_MAINTENANCE, "Match Progression & Ban Cleanup", || {
                        let p = p.clone();
                        async move {
                            run_match_progression_and_cleanup(&p).await?;
                            run_expired_bans_cleanup(&p).await
                        }
                    }).await;
                }
            }).await.expect("Failed to schedule match-maintenance job");
        }

        // 3a. 10:00 AM IST — daily push reminders
        {
            let p = pool.clone();
            let h = http_client.clone();
            cron.add_fn("0 0 10 * * * *", move || {
                let p = p.clone(); let h = h.clone();
                async move {
                    with_advisory_lock(&p, LOCK_DAILY_REMINDERS, "Morning Push Reminders (10am IST)", || {
                        let p = p.clone(); let h = h.clone();
                        async move { run_daily_testing_reminders(&p, &h).await }
                    }).await;
                }
            }).await.expect("Failed to schedule 10am reminders job");
        }

        // 3b. 3:00 PM IST
        {
            let p = pool.clone();
            let h = http_client.clone();
            cron.add_fn("0 0 15 * * * *", move || {
                let p = p.clone(); let h = h.clone();
                async move {
                    with_advisory_lock(&p, LOCK_DAILY_REMINDERS, "Afternoon Push Reminders (3pm IST)", || {
                        let p = p.clone(); let h = h.clone();
                        async move { run_daily_testing_reminders(&p, &h).await }
                    }).await;
                }
            }).await.expect("Failed to schedule 3pm reminders job");
        }

        // 3c. 8:00 PM IST
        {
            let p = pool.clone();
            let h = http_client.clone();
            cron.add_fn("0 0 20 * * * *", move || {
                let p = p.clone(); let h = h.clone();
                async move {
                    with_advisory_lock(&p, LOCK_DAILY_REMINDERS, "Evening Push Reminders (8pm IST)", || {
                        let p = p.clone(); let h = h.clone();
                        async move { run_daily_testing_reminders(&p, &h).await }
                    }).await;
                }
            }).await.expect("Failed to schedule 8pm reminders job");
        }

        // 4. 3:00 AM IST — nightly DB cleanup
        {
            let p = pool.clone();
            cron.add_fn("0 0 3 * * * *", move || {
                let p = p.clone();
                async move {
                    with_advisory_lock(&p, LOCK_DB_CLEANUP, "Nightly DB Cleanup", || {
                        let p = p.clone();
                        async move {
                            run_notification_cleanup(&p).await?;
                            run_old_matches_cleanup(&p).await?;
                            run_reputation_logs_cleanup(&p).await?;
                            Ok(())
                        }
                    }).await;
                }
            }).await.expect("Failed to schedule db-cleanup job");
        }

        // 5. Initial maintenance checks on server boot (data cleanups only)
        {
            let p = pool.clone();
            tokio::spawn(async move {
                with_advisory_lock(&p, LOCK_BOOT_CLEANUP, "Server Boot Cleanup", || {
                    let p = p.clone();
                    async move {
                        let _ = run_notification_cleanup(&p).await;
                        let _ = run_expired_bans_cleanup(&p).await;
                        let _ = run_old_matches_cleanup(&p).await;
                        let _ = run_reputation_logs_cleanup(&p).await;
                        Ok(())
                    }
                }).await;
            });
        }

        info!("✅ All cron jobs scheduled (Asia/Kolkata):");
        info!("   00:00 IST — Streak maintenance");
        info!("   00:10 IST — Match progression + expired bans");
        info!("   10:00 IST — Push reminders");
        info!("   15:00 IST — Push reminders");
        info!("   20:00 IST — Push reminders");
        info!("   03:00 IST — Nightly DB cleanup");

        cron.start().await;
    });
}
