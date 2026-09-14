use serde::Serialize;
use tracing::{error, info};

#[derive(Debug, Serialize)]
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

    match client
        .post("https://exp.host/--/api/v2/push/send")
        .json(&vec![message])
        .send()
        .await
    {
        Ok(res) => {
            if res.status().is_success() {
                info!("📱 Push notification sent successfully to {}", push_token);
            } else {
                error!("Failed to send push notification: status {}", res.status());
            }
        }
        Err(e) => {
            error!("Error sending push notification: {:?}", e);
        }
    }
}
