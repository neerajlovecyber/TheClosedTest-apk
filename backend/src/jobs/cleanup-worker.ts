import { and, eq, lt } from "drizzle-orm"

import { db } from "../db"
import { notifications, userBans } from "../db/schema"

export async function runNotificationCleanup() {
  console.log("⏰ Running notification cleanup (deleting notifications older than 7 days)...")

  try {
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)

    const result = await db
      .delete(notifications)
      .where(lt(notifications.createdAt, sevenDaysAgo))
      .returning({ id: notifications.id })

    console.log(`🧹 Cleaned up ${result.length} old notifications from DB (>7 days old)`)
  } catch (error) {
    console.error("❌ Failed to clean up old notifications:", error)
  }
}

export async function runExpiredBansCleanup() {
  console.log("⏰ Running expired user bans cleanup...")

  try {
    const now = new Date()
    const result = await db
      .delete(userBans)
      .where(and(eq(userBans.permanent, false), lt(userBans.expiresAt, now)))
      .returning({ id: userBans.id })

    if (result.length > 0) {
      console.log(`🔓 Lifted ${result.length} expired temporary user bans`)
    }
  } catch (error) {
    console.error("❌ Failed to clean up expired bans:", error)
  }
}

export async function runReputationLogsCleanup() {
  console.log("⏰ Running 60-day reputation audit logs cleanup...")

  try {
    const sixtyDaysAgo = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000)
    const { reputationLogs } = await import("../db/schema")

    const result = await db
      .delete(reputationLogs)
      .where(lt(reputationLogs.createdAt, sixtyDaysAgo))
      .returning({ id: reputationLogs.id })

    if (result.length > 0) {
      console.log(`🧹 Cleaned up ${result.length} old reputation logs (>60 days old)`)
    }
  } catch (error) {
    console.error("❌ Failed to clean up old reputation logs:", error)
  }
}
