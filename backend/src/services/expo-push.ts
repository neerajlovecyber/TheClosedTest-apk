import { env } from "../env"

export interface PushNotificationPayload {
  to: string | string[]
  title: string
  body: string
  data?: Record<string, unknown>
  sound?: "default" | null
  priority?: "default" | "normal" | "high"
  channelId?: string
}

export async function sendExpoPushNotification(
  payload: PushNotificationPayload,
): Promise<{ success: boolean; error?: string }> {
  const recipients = Array.isArray(payload.to) ? payload.to : [payload.to]
  const validTokens = recipients.filter(
    (token) => token && (token.startsWith("ExponentPushToken[") || token.startsWith("ExpoPushToken[")),
  )

  if (validTokens.length === 0) {
    return { success: true } // No valid recipients, safely no-op
  }

  const messages = validTokens.map((token) => ({
    to: token,
    sound: payload.sound || "default",
    title: payload.title,
    body: payload.body,
    data: payload.data || {},
    priority: payload.priority || "high",
    channelId: payload.channelId || "default",
  }))

  try {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      Accept: "application/json",
      "Accept-Encoding": "gzip, deflate",
    }

    if (env.EXPO_ACCESS_TOKEN) {
      headers.Authorization = `Bearer ${env.EXPO_ACCESS_TOKEN}`
    }

    const response = await fetch("https://exp.host/--/api/v2/push/send", {
      method: "POST",
      headers,
      body: JSON.stringify(messages),
    })

    if (!response.ok) {
      const errorText = await response.text()
      console.error("❌ Expo push API error:", errorText)
      return { success: false, error: errorText }
    }

    return { success: true }
  } catch (error) {
    console.error("❌ Failed to send Expo push notification:", error)
    return { success: false, error: String(error) }
  }
}
