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

  /**
   * Retrieves user notifications list and unread count.
   */
  static async getUserNotifications(userId: string, limit = 50) {
    const { desc } = await import("drizzle-orm")
    const items = await db.query.notifications.findMany({
      where: (n, { eq }) => eq(n.userId, userId),
      orderBy: [desc(notifications.createdAt)],
      limit,
    })

    const formatted = items.map((n) => ({
      ...n,
      isRead: n.read,
    }))

    const unreadCount = formatted.filter((n) => !n.read).length

    return {
      notifications: formatted,
      unreadCount,
    }
  }

  /**
   * Marks a single notification as read.
   */
  static async markAsRead(id: string, userId: string) {
    const { and, eq } = await import("drizzle-orm")
    await db
      .update(notifications)
      .set({ read: true })
      .where(and(eq(notifications.id, id), eq(notifications.userId, userId)))
  }

  /**
   * Marks all user notifications as read.
   */
  static async markAllAsRead(userId: string) {
    const { eq } = await import("drizzle-orm")
    await db.update(notifications).set({ read: true }).where(eq(notifications.userId, userId))
  }

  /**
   * Clears all notifications for a user.
   */
  static async clearAll(userId: string) {
    const { eq } = await import("drizzle-orm")
    await db.delete(notifications).where(eq(notifications.userId, userId))
  }

  /**
   * Deletes a single notification.
   */
  static async deleteNotification(id: string, userId: string) {
    const { and, eq } = await import("drizzle-orm")
    await db.delete(notifications).where(and(eq(notifications.id, id), eq(notifications.userId, userId)))
  }
}
