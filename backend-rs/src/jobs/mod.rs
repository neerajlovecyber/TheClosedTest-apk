use std::time::Duration;
use sqlx::PgPool;
use tracing::{error, info};
use uuid::Uuid;

use crate::services::push::send_push_notification;

pub fn start_background_jobs(pool: PgPool, http_client: reqwest::Client) {
    tokio::spawn(async move {
        info!("⏰ Background maintenance worker started");
        let mut interval = tokio::time::interval(Duration::from_secs(6 * 3600)); // Every 6 hours

        loop {
            interval.tick().await;
            info!("🔄 Running scheduled maintenance jobs...");

            // 1. Reset inactive streaks (> 48 hours without check-in)
            let streak_result = sqlx::query(
                r#"
                UPDATE users
                SET streak = 0, updated_at = NOW()
                WHERE streak > 0
                  AND last_check_in_date IS NOT NULL
                  AND TO_DATE(last_check_in_date, 'YYYY-MM-DD') < CURRENT_DATE - INTERVAL '1 DAY'
                "#,
            )
            .execute(&pool)
            .await;

            match streak_result {
                Ok(res) => {
                    if res.rows_affected() > 0 {
                        info!("Reset {} inactive user streaks to 0", res.rows_affected());
                    }
                }
                Err(e) => error!("Error running streak reset job: {:?}", e),
            }

            // 2. Inactive match daily reminders (> 24 hours without activity)
            let inactive_matches: Result<Vec<(String, String, String, Option<String>, Option<String>)>, _> = sqlx::query_as(
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
            .fetch_all(&pool)
            .await;

            match inactive_matches {
                Ok(matches) => {
                    for (match_id, u1_id, u2_id, u1_token, u2_token) in matches {
                        // Notify user1
                        let notif_id1 = Uuid::new_v4().to_string();
                        let data1 = serde_json::json!({ "matchId": match_id });
                        let _ = sqlx::query(
                            "INSERT INTO notifications (id, user_id, type, title, body, data, read, created_at) VALUES ($1, $2, 'reminder', 'Daily Testing Reminder', 'Remember to open your partner\\'s app and test today!', $3, false, NOW())",
                        )
                        .bind(notif_id1)
                        .bind(&u1_id)
                        .bind(&data1)
                        .execute(&pool)
                        .await;

                        if let Some(token) = u1_token {
                            send_push_notification(
                                &http_client,
                                &token,
                                "Daily Testing Reminder".to_string(),
                                "Remember to open your partner's app and test today!".to_string(),
                                data1,
                            ).await;
                        }

                        // Notify user2
                        let notif_id2 = Uuid::new_v4().to_string();
                        let data2 = serde_json::json!({ "matchId": match_id });
                        let _ = sqlx::query(
                            "INSERT INTO notifications (id, user_id, type, title, body, data, read, created_at) VALUES ($1, $2, 'reminder', 'Daily Testing Reminder', 'Remember to open your partner\\'s app and test today!', $3, false, NOW())",
                        )
                        .bind(notif_id2)
                        .bind(&u2_id)
                        .bind(&data2)
                        .execute(&pool)
                        .await;

                        if let Some(token) = u2_token {
                            send_push_notification(
                                &http_client,
                                &token,
                                "Daily Testing Reminder".to_string(),
                                "Remember to open your partner's app and test today!".to_string(),
                                data2,
                            ).await;
                        }
                    }
                }
                Err(e) => error!("Error running inactive matches reminder job: {:?}", e),
            }
        }
    });
}
