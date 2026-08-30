import { Cron } from "croner"
import { and, desc, eq, inArray, lt, or, sql } from "drizzle-orm"

import { db } from "../db"
import { matches, notifications, proofs, userBans, users } from "../db/schema"
import { memoryCache } from "../lib/cache"
import { sendExpoPushNotification } from "../services/expo-push"

export async function runDailyStreakMaintenance() {
  console.log("⏰ Running daily streak & activity maintenance...")

  const today = new Date().toISOString().split("T")[0]
  const yesterday = new Date(Date.now() - 86400000).toISOString().split("T")[0]

  try {
    // Reset streak to 0 and deduct -2 reputation penalty for users who missed check in
    await db
      .update(users)
      .set({
        streak: 0,
        reputation: sql`GREATEST(0, ${users.reputation} - 2)`,
      })
      .where(
        and(
          sql`${users.lastCheckInDate} IS NOT NULL`,
          sql`${users.lastCheckInDate} != ${today}`,
          sql`${users.lastCheckInDate} != ${yesterday}`,
          sql`${users.streak} > 0`,
        ),
      )

    console.log("✅ Streaks updated successfully")
  } catch (error) {
    console.error("❌ Failed to maintain streaks:", error)
  }
}

export async function runMatchProgressionAndCleanup() {
  console.log("⏰ Running match completion, abandonment, and cleanup checks...")

  const now = new Date()
  const twoDaysAgo = new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000)
  const threeDaysAgo = new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000)
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)

  try {
    // 1. Auto-complete matches where both users completed 14 approved days
    const completableMatches = await db.query.matches.findMany({
      where: and(
        eq(matches.status, "active"),
        sql`${matches.user1ApprovedCount} >= 14`,
        sql`${matches.user2ApprovedCount} >= 14`,
      ),
    })

    for (const match of completableMatches) {
      console.log(`🎉 Auto-completing 14-day match ${match.id}...`)
      await db
        .update(matches)
        .set({
          status: "completed",
          completedAt: now,
          updatedAt: now,
        })
        .where(eq(matches.id, match.id))

      // Reward +20 reputation to both participants
      await db
        .update(users)
        .set({
          reputation: sql`${users.reputation} + 20`,
        })
        .where(sql`${users.id} = ${match.user1Id} OR ${users.id} = ${match.user2Id}`)
    }

    // 2. Auto-abandon active matches where a tester is inactive for 3+ consecutive days (72 hours)
    const activeMatches = await db.query.matches.findMany({
      where: eq(matches.status, "active"),
      with: {
        user1: true,
        user2: true,
        proofs: {
          orderBy: [desc(proofs.submittedAt)],
        },
      },
    })

    for (const match of activeMatches) {
      // Use match.startDate as the anchor. If not set, fallback to updatedAt or now (NEVER stale createdAt)
      const matchStart = match.startDate ? new Date(match.startDate) : match.updatedAt ? new Date(match.updatedAt) : now

      // Guard: If the match itself started less than 2 full days ago,
      // it CANNOT be considered for warnings or abandonment under any circumstances.
      if (matchStart > twoDaysAgo) {
        continue
      }

      // Find latest proof timestamp for each user
      const user1Proofs = match.proofs?.filter((p) => p.uploaderId === match.user1Id) || []
      const user2Proofs = match.proofs?.filter((p) => p.uploaderId === match.user2Id) || []

      const user1LastActive = user1Proofs[0] ? new Date(user1Proofs[0].submittedAt) : matchStart
      const user2LastActive = user2Proofs[0] ? new Date(user2Proofs[0].submittedAt) : matchStart

      const user1Inactive = user1LastActive < threeDaysAgo && matchStart <= threeDaysAgo
      const user2Inactive = user2LastActive < threeDaysAgo && matchStart <= threeDaysAgo

      if (user1Inactive || user2Inactive) {
        console.log(`⚠️ Match ${match.id} abandoned due to testing inactivity (>3 days). Cancelling...`)

        await db
          .update(matches)
          .set({
            status: "cancelled",
            updatedAt: now,
          })
          .where(eq(matches.id, match.id))

        // Penalize inactive users (-10 reputation) & notify active partner
        if (user1Inactive && !user2Inactive) {
          // User 1 abandoned
          await db
            .update(users)
            .set({
              reputation: sql`GREATEST(0, ${users.reputation} - 10)`,
              streak: 0,
            })
            .where(eq(users.id, match.user1Id))

          await db.insert(notifications).values([
            {
              userId: match.user1Id,
              type: "match_cancelled",
              title: "Match Cancelled (Inactivity Penalty)",
              body: "Your testing match was cancelled due to 3+ consecutive days of inactivity. -10 reputation penalty applied.",
              data: { matchId: match.id },
            },
            {
              userId: match.user2Id,
              type: "match_cancelled",
              title: "Partner Inactive - Match Cancelled",
              body: "Your peer tester stopped testing for 3+ consecutive days. The match was cancelled so you can match with an active tester.",
              data: { matchId: match.id },
            },
          ])

          if (match.user2?.pushToken) {
            sendExpoPushNotification({
              to: match.user2.pushToken,
              title: "Partner Inactive - Match Cancelled",
              body: "Your peer tester was inactive. The match has ended so you can pair with a new tester.",
              data: { matchId: match.id },
            }).catch(() => {})
          }
        } else if (user2Inactive && !user1Inactive) {
          // User 2 abandoned
          await db
            .update(users)
            .set({
              reputation: sql`GREATEST(0, ${users.reputation} - 10)`,
              streak: 0,
            })
            .where(eq(users.id, match.user2Id))

          await db.insert(notifications).values([
            {
              userId: match.user2Id,
              type: "match_cancelled",
              title: "Match Cancelled (Inactivity Penalty)",
              body: "Your testing match was cancelled due to 3+ consecutive days of inactivity. -10 reputation penalty applied.",
              data: { matchId: match.id },
            },
            {
              userId: match.user1Id,
              type: "match_cancelled",
              title: "Partner Inactive - Match Cancelled",
              body: "Your peer tester stopped testing for 3+ consecutive days. The match was cancelled so you can match with an active tester.",
              data: { matchId: match.id },
            },
          ])

          if (match.user1?.pushToken) {
            sendExpoPushNotification({
              to: match.user1.pushToken,
              title: "Partner Inactive - Match Cancelled",
              body: "Your peer tester was inactive. The match has ended so you can pair with a new tester.",
              data: { matchId: match.id },
            }).catch(() => {})
          }
        } else {
          // Both inactive
          await db
            .update(users)
            .set({
              reputation: sql`GREATEST(0, ${users.reputation} - 10)`,
              streak: 0,
            })
            .where(or(eq(users.id, match.user1Id), eq(users.id, match.user2Id)))

          await db.insert(notifications).values([
            {
              userId: match.user1Id,
              type: "match_cancelled",
              title: "Match Cancelled (Inactivity)",
              body: "Your match was cancelled due to testing inactivity. -10 reputation penalty applied.",
              data: { matchId: match.id },
            },
            {
              userId: match.user2Id,
              type: "match_cancelled",
              title: "Match Cancelled (Inactivity)",
              body: "Your match was cancelled due to testing inactivity. -10 reputation penalty applied.",
              data: { matchId: match.id },
            },
          ])
        }
      } else {
        // 2b. Urgent 48-hour Inactivity Warning (24 hours before 72-hour cancellation)
        const twoDaysAgo = new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000)
        const twentyFourHoursAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000)

        // Check User 1
        if (user1LastActive < twoDaysAgo && matchStart <= twoDaysAgo) {
          const alreadyWarned1 = await db.query.notifications.findFirst({
            where: and(
              eq(notifications.userId, match.user1Id),
              eq(notifications.type, "reminder"),
              sql`${notifications.data}->>'subtype' = 'inactivity_warning'`,
              sql`${notifications.data}->>'matchId' = ${match.id}`,
              sql`${notifications.createdAt} >= ${twentyFourHoursAgo}`,
            ),
          })
          if (!alreadyWarned1) {
            await db.insert(notifications).values({
              userId: match.user1Id,
              type: "reminder",
              title: "⚠️ Urgent: Testing Match In Danger",
              body: "You haven't submitted test proof in 48 hours. Please upload proof within 24 hours to prevent your match from being cancelled with a -10 reputation penalty.",
              data: { matchId: match.id, subtype: "inactivity_warning" },
            })
            if (match.user1?.pushToken) {
              sendExpoPushNotification({
                to: match.user1.pushToken,
                title: "⚠️ Urgent: Testing Match In Danger",
                body: "You haven't submitted test proof in 48 hours. Upload proof within 24h to avoid match cancellation.",
                data: { matchId: match.id },
              }).catch(() => {})
            }
          }
        }

        // Check User 2
        if (user2LastActive < twoDaysAgo && matchStart <= twoDaysAgo) {
          const alreadyWarned2 = await db.query.notifications.findFirst({
            where: and(
              eq(notifications.userId, match.user2Id),
              eq(notifications.type, "reminder"),
              sql`${notifications.data}->>'subtype' = 'inactivity_warning'`,
              sql`${notifications.data}->>'matchId' = ${match.id}`,
              sql`${notifications.createdAt} >= ${twentyFourHoursAgo}`,
            ),
          })
          if (!alreadyWarned2) {
            await db.insert(notifications).values({
              userId: match.user2Id,
              type: "reminder",
              title: "⚠️ Urgent: Testing Match In Danger",
              body: "You haven't submitted test proof in 48 hours. Please upload proof within 24 hours to prevent your match from being cancelled with a -10 reputation penalty.",
              data: { matchId: match.id, subtype: "inactivity_warning" },
            })
            if (match.user2?.pushToken) {
              sendExpoPushNotification({
                to: match.user2.pushToken,
                title: "⚠️ Urgent: Testing Match In Danger",
                body: "You haven't submitted test proof in 48 hours. Upload proof within 24h to avoid match cancellation.",
                data: { matchId: match.id },
              }).catch(() => {})
            }
          }
        }
      }
    }

    // 3. Auto-expire stale pending requests older than 7 days
    const stalePendingMatches = await db.query.matches.findMany({
      where: and(eq(matches.status, "pending"), lt(matches.createdAt, sevenDaysAgo)),
    })

    if (stalePendingMatches.length > 0) {
      console.log(`🧹 Expiring ${stalePendingMatches.length} stale pending match requests (>7 days)...`)

      for (const pendingMatch of stalePendingMatches) {
        await db
          .update(matches)
          .set({
            status: "cancelled",
            updatedAt: now,
          })
          .where(eq(matches.id, pendingMatch.id))

        await db.insert(notifications).values({
          userId: pendingMatch.user1Id,
          type: "match_cancelled",
          title: "Match Request Expired",
          body: "Your match request expired after 7 days without response.",
          data: { matchId: pendingMatch.id },
        })
      }
    }

    // Invalidate public feed cache if matches progressed or completed
    memoryCache.delete("apps_list:")
  } catch (error) {
    console.error("❌ Failed match progression check:", error)
  }
}

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

export async function runOldMatchesCleanup() {
  console.log("⏰ Running 60-day completed/cancelled match archival...")

  try {
    const sixtyDaysAgo = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000)
    const result = await db
      .update(matches)
      .set({ status: "archived", updatedAt: new Date() })
      .where(
        and(or(eq(matches.status, "completed"), eq(matches.status, "cancelled")), lt(matches.updatedAt, sixtyDaysAgo)),
      )
      .returning({ id: matches.id })

    if (result.length > 0) {
      console.log(`📦 Archived ${result.length} old matches (>60 days old)`)
    }
  } catch (error) {
    console.error("❌ Failed to archive old matches:", error)
  }
}

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
      // 1. Did User 2 upload proof for today? (User 2 tests App 1)
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

      // 2. Does User 2 have a pending review for User 1's proof? (User 1 uploaded proof for App 2)
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

async function withAdvisoryLock(lockId: number, taskName: string, task: () => Promise<void>) {
  try {
    const lockResult = (await db.execute(sql`SELECT pg_try_advisory_lock(${lockId}) AS acquired`)) as unknown as Array<{
      acquired: boolean
    }>

    const acquired = lockResult[0]?.acquired ?? false
    if (!acquired) {
      console.log(`🔒 [AdvisoryLock] Skipping ${taskName}: another server instance is already running this job.`)
      return
    }

    try {
      await task()
    } finally {
      await db.execute(sql`SELECT pg_advisory_unlock(${lockId})`).catch(() => {})
    }
  } catch (err) {
    console.error(`❌ [AdvisoryLock] Error managing lock for ${taskName}:`, err)
    // Fallback to running task directly
    await task()
  }
}

export function startCronJobs() {
  if (process.env.NODE_ENV === "test") return

  console.log("🚀 Initializing Croner background schedulers with PG Advisory Locks (Asia/Kolkata)...")

  // 1. Midnight IST Streak Check & Penalty Maintenance (00:00 IST) - Lock 1001
  new Cron("0 0 * * *", { timezone: "Asia/Kolkata", name: "daily-streak" }, async () => {
    console.log("🌙 Triggering Midnight IST Streak Maintenance...")
    await withAdvisoryLock(1001, "Midnight IST Streak Maintenance", runDailyStreakMaintenance)
  })

  // 2. Active Match Progression, Inactivity Auto-Cancellation, and Expired Bans (Daily at 11:00 PM IST) - Lock 1002
  new Cron("0 23 * * *", { timezone: "Asia/Kolkata", name: "match-maintenance" }, async () => {
    console.log("🔄 Triggering Nightly Match Progression & Inactivity Check (11:00 PM IST)...")
    await withAdvisoryLock(1002, "Match Progression & Ban Expirations", async () => {
      await runMatchProgressionAndCleanup()
      await runExpiredBansCleanup()
    })
  })

  // 3. Testing & Review Push Reminders (10:00 AM, 3:00 PM, and 8:00 PM IST) - Lock 1003
  new Cron("0 10,15,20 * * *", { timezone: "Asia/Kolkata", name: "daily-reminders" }, async () => {
    console.log("🔔 Triggering Daily Testing & Review Push Reminders...")
    await withAdvisoryLock(1003, "Daily Testing & Review Push Reminders", runDailyTestingReminders)
  })

  // 4. Nightly DB Cleanups (Notifications >7d, Old Matches >60d) at 03:00 AM IST - Lock 1004
  new Cron("0 3 * * *", { timezone: "Asia/Kolkata", name: "db-cleanup" }, async () => {
    console.log("🧹 Triggering Nightly Database Cleanup...")
    await withAdvisoryLock(1004, "Nightly Database Cleanup", async () => {
      await runNotificationCleanup()
      await runOldMatchesCleanup()
    })
  })

  // Initial maintenance checks on server boot (data cleanups only, NO mid-day match cancellation) - Lock 1005
  withAdvisoryLock(1005, "Server Boot Cleanup", async () => {
    await runNotificationCleanup()
    await runExpiredBansCleanup()
    await runOldMatchesCleanup()
  })
}

export const startBackgroundJobs = startCronJobs
