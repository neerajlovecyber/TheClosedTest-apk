import { and, eq, sql } from "drizzle-orm"

import { db } from "../db"
import { matches, notifications } from "../db/schema"
import { sendExpoPushNotification } from "../services/expo-push"

const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000
const DAY_MS = 24 * 60 * 60 * 1000

function getMatchDay(startDate?: Date | null, createdAt?: Date | null): number {
  const start = startDate || createdAt
  if (!start) return 1
  const startDayIST = Math.floor((new Date(start).getTime() + IST_OFFSET_MS) / DAY_MS)
  const todayDayIST = Math.floor((Date.now() + IST_OFFSET_MS) / DAY_MS)
  const elapsed = Math.max(0, todayDayIST - startDayIST)
  return Math.min(14, Math.max(1, elapsed + 1))
}

export async function runDailyTestingReminders() {
  console.log("⏰ Checking and sending daily testing & review reminders...")

  try {
    const activeMatches = await db.query.matches.findMany({
      where: eq(matches.status, "active"),
      with: {
        user1: true,
        user2: true,
        app1: true,
        app2: true,
        proofs: true,
      },
    })

    // Map: userId -> { pushToken?: string, uploadApps: string[], reviewApps: string[] }
    const userReminderMap = new Map<string, { pushToken?: string | null; uploadApps: string[]; reviewApps: string[] }>()

    for (const match of activeMatches) {
      const matchDay = getMatchDay(match.startDate, match.createdAt)
      const user1Proofs = match.proofs?.filter((p) => p.uploaderId === match.user1Id) || []
      const user2Proofs = match.proofs?.filter((p) => p.uploaderId === match.user2Id) || []

      // --- USER 1 CHECKS ---
      // 1. Did User 1 upload proof for today? (User 1 tests App 2)
      const user1UploadedToday = user1Proofs.some((p) => p.day === matchDay && p.status !== "rejected")
      if (!user1UploadedToday) {
        const entry = userReminderMap.get(match.user1Id) || {
          pushToken: match.user1?.pushToken,
          uploadApps: [],
          reviewApps: [],
        }
        entry.pushToken = match.user1?.pushToken || entry.pushToken
        if (match.app2?.title && !entry.uploadApps.includes(match.app2.title)) {
          entry.uploadApps.push(match.app2.title)
        }
        userReminderMap.set(match.user1Id, entry)
      }

      // 2. Does User 1 have a pending review for User 2's proof? (User 2 uploaded proof for App 1)
      const user2PendingProof = user2Proofs.find((p) => p.status === "pending")
      if (user2PendingProof) {
        const entry = userReminderMap.get(match.user1Id) || {
          pushToken: match.user1?.pushToken,
          uploadApps: [],
          reviewApps: [],
        }
        entry.pushToken = match.user1?.pushToken || entry.pushToken
        if (match.app1?.title && !entry.reviewApps.includes(match.app1.title)) {
          entry.reviewApps.push(match.app1.title)
        }
        userReminderMap.set(match.user1Id, entry)
      }

      // --- USER 2 CHECKS ---
      // 3. Did User 2 upload proof for today? (User 2 tests App 1)
      const user2UploadedToday = user2Proofs.some((p) => p.day === matchDay && p.status !== "rejected")
      if (!user2UploadedToday) {
        const entry = userReminderMap.get(match.user2Id) || {
          pushToken: match.user2?.pushToken,
          uploadApps: [],
          reviewApps: [],
        }
        entry.pushToken = match.user2?.pushToken || entry.pushToken
        if (match.app1?.title && !entry.uploadApps.includes(match.app1.title)) {
          entry.uploadApps.push(match.app1.title)
        }
        userReminderMap.set(match.user2Id, entry)
      }

      // 4. Does User 2 have a pending review for User 1's proof? (User 1 uploaded proof for App 2)
      const user1PendingProof = user1Proofs.find((p) => p.status === "pending")
      if (user1PendingProof) {
        const entry = userReminderMap.get(match.user2Id) || {
          pushToken: match.user2?.pushToken,
          uploadApps: [],
          reviewApps: [],
        }
        entry.pushToken = match.user2?.pushToken || entry.pushToken
        if (match.app2?.title && !entry.reviewApps.includes(match.app2.title)) {
          entry.reviewApps.push(match.app2.title)
        }
        userReminderMap.set(match.user2Id, entry)
      }
    }

    // Send consolidated notifications per user
    const fourHoursAgo = new Date(Date.now() - 4 * 60 * 60 * 1000)

    for (const [userId, { pushToken, uploadApps, reviewApps }] of userReminderMap) {
      if (uploadApps.length === 0 && reviewApps.length === 0) continue

      // Deduplication guard: Avoid spamming the user if a reminder was sent in the last 4 hours
      const recentReminder = await db.query.notifications.findFirst({
        where: and(
          eq(notifications.userId, userId),
          eq(notifications.type, "reminder"),
          sql`${notifications.createdAt} >= ${fourHoursAgo}`,
        ),
      })
      if (recentReminder) {
        continue
      }

      let title = "Daily Testing Reminder"
      let body = ""

      if (uploadApps.length > 0 && reviewApps.length > 0) {
        title = "⏰ Daily Test & Review Reminder"
        body = `You have ${uploadApps.length} app(s) to test and ${reviewApps.length} proof(s) to review today.`
      } else if (uploadApps.length === 1) {
        title = "⏰ Daily Test Reminder"
        body = `Don't forget to test ${uploadApps[0]} today to protect your streak!`
      } else if (uploadApps.length > 1) {
        title = "⏰ Daily Test Reminder"
        body = `You have ${uploadApps.length} apps waiting for today's test. Upload screenshots before midnight!`
      } else if (reviewApps.length > 0) {
        title = "🔍 Pending Proof Review"
        body = `Your partner submitted testing proof for ${reviewApps.join(", ")}. Please review it!`
      }

      // 1. Send push notification if user has push token
      if (pushToken) {
        sendExpoPushNotification({
          to: pushToken,
          title,
          body,
        }).catch((err) => console.error(`Push error for user ${userId}:`, err))
      }

      // 2. Insert in-app notification
      await db
        .insert(notifications)
        .values({
          userId,
          type: "reminder",
          title,
          body,
        })
        .catch(() => {})
    }
  } catch (error) {
    console.error("❌ Failed to send daily testing reminders:", error)
  }
}
