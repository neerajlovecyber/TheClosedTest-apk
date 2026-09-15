use serde::Serialize;
use tracing::{error, info, warn};

#[derive(Debug, Serialize, Clone)]
pub struct ExpoPushMessage {
    pub to: String,
    pub sound: Option<&'static str>,
    pub title: String,
    pub body: String,
    pub data: serde_json::Value,
    pub priority: &'static str,
    pub channel_id: &'static str,
}

pub async fn send_push_notification(
    client: &reqwest::Client,
    push_token: &str,
    title: String,
    body: String,
    data: serde_json::Value,
) {
    if !push_token.starts_with("ExponentPushToken[") && !push_token.starts_with("ExpoPushToken[") {
        return;
    }

    let message = ExpoPushMessage {
        to: push_token.to_string(),
        sound: Some("default"),
        title,
        body,
        data,
        priority: "high",
        channel_id: "default",
    };

    let max_attempts = 3;
    let mut attempt = 0;
    let mut backoff_ms = 300;

    loop {
        attempt += 1;
        match client
            .post("https://exp.host/--/api/v2/push/send")
            .json(&vec![&message])
            .send()
            .await
        {
            Ok(res) => {
                let status = res.status();
                if status.is_success() {
                    info!("📱 Push notification sent successfully to {}", push_token);
                    break;
                } else if (status.is_server_error() || status.as_u16() == 429) && attempt < max_attempts {
                    warn!(
                        "Push notification to {} failed with status {} (attempt {}/{}); retrying in {}ms...",
                        push_token, status, attempt, max_attempts, backoff_ms
                    );
                    tokio::time::sleep(std::time::Duration::from_millis(backoff_ms)).await;
                    backoff_ms *= 2;
                } else {
                    error!(
                        "Failed to send push notification to {}: status {}",
                        push_token, status
                    );
                    break;
                }
            }
            Err(e) => {
                if attempt < max_attempts {
                    warn!(
                        "Error sending push notification to {} (attempt {}/{}): {:?}; retrying in {}ms...",
                        push_token, attempt, max_attempts, e, backoff_ms
                    );
                    tokio::time::sleep(std::time::Duration::from_millis(backoff_ms)).await;
                    backoff_ms *= 2;
                } else {
                    error!("Error sending push notification to {}: {:?}", push_token, e);
                    break;
                }
            }
        }
    }
}

