import { eq } from "drizzle-orm"

import { db } from "../db"
import { notifications, users } from "../db/schema"
import { sendExpoPushNotification } from "./expo-push"

export type NotificationType = "request" | "acceptance" | "reminder" | "proof_update" | "message" | "match_cancelled"

export interface SendNotificationOptions {
  userId: string
  type: NotificationType
  title: string
  body: string
  data?: Record<string, unknown>
  sendPush?: boolean
  pushTitle?: string
  pushBody?: string
}

export class NotificationService {
  /**
   * Dispatches an in-app notification and optionally an Expo push alert.
   * Push alerts run asynchronously in the background and will not throw or block the caller.
   */
  static async send(options: SendNotificationOptions): Promise<void> {
    const { userId, type, title, body, data = {}, sendPush = true, pushTitle, pushBody } = options

    // 1. Create in-app notification row in database
    await db
      .insert(notifications)
      .values({
        userId,
        type,
        title,
        body,
        data,
      })
      .catch((err) => {
        console.error(`❌ Failed to insert in-app notification for user ${userId}:`, err)
      })

    // 2. Dispatch push notification if enabled
    if (sendPush) {
      this.dispatchPush(userId, pushTitle || title, pushBody || body, data).catch((err) => {
        console.error(`❌ Uncaught error during push dispatch for user ${userId}:`, err)
      })
    }
  }

  /**
   * Internal helper to lookup user's push token and transmit via Expo SDK.
   */
  private static async dispatchPush(
    userId: string,
    title: string,
    body: string,
    data: Record<string, unknown>,
  ): Promise<void> {
    try {
      const targetUser = await db.query.users.findFirst({
        where: (u, { eq }) => eq(u.id, userId),
        columns: {
          pushToken: true,
        },
      })

      if (!targetUser?.pushToken) return

      await sendExpoPushNotification({
        to: targetUser.pushToken,
        title,
        body,
        data,
      })
    } catch (error) {
      console.error(`Push notification failed for user ${userId}:`, error)
    }
  }
}
