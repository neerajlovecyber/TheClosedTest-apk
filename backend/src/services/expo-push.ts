import { Expo, type ExpoPushMessage, type ExpoPushTicket } from "expo-server-sdk"
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

// Initialize Expo SDK client
const expo = new Expo({
  accessToken: env.EXPO_ACCESS_TOKEN || undefined,
})

export async function sendExpoPushNotification(
  payload: PushNotificationPayload,
): Promise<{ success: boolean; tickets?: ExpoPushTicket[]; error?: string }> {
  if (process.env.NODE_ENV === "test") {
    return { success: true }
  }

  const recipients = Array.isArray(payload.to) ? payload.to : [payload.to]

  // Filter only valid Expo push tokens
  const validTokens = recipients.filter((token) => Boolean(token) && Expo.isExpoPushToken(token))

  if (validTokens.length === 0) {
    return { success: true } // No valid recipients, safely no-op
  }

  const messages: ExpoPushMessage[] = validTokens.map((token) => ({
    to: token,
    sound: payload.sound === null ? null : "default",
    title: payload.title,
    body: payload.body,
    data: payload.data || {},
    priority: payload.priority || "high",
    channelId: payload.channelId || "default",
  }))

  // Chunk messages into batches of 100 as required by Expo
  const chunks = expo.chunkPushNotifications(messages)
  const tickets: ExpoPushTicket[] = []

  try {
    for (const chunk of chunks) {
      try {
        const ticketChunk = await expo.sendPushNotificationsAsync(chunk)
        tickets.push(...ticketChunk)
      } catch (chunkError) {
        console.error("❌ Failed to send chunk of Expo push notifications:", chunkError)
      }
    }

    return { success: true, tickets }
  } catch (error) {
    console.error("❌ Failed to send Expo push notification:", error)
    return { success: false, error: String(error) }
  }
}
