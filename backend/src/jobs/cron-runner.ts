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

      // Guard: If the match itself started less than 3 full days ago,
      // it CANNOT be considered abandoned under any circumstances.
      if (matchStart > threeDaysAgo) {
        continue
      }

      // Find latest proof timestamp for each user
      const user1Proofs = match.proofs?.filter((p) => p.uploaderId === match.user1Id) || []
      const user2Proofs = match.proofs?.filter((p) => p.uploaderId === match.user2Id) || []

      const user1LastActive = user1Proofs[0] ? new Date(user1Proofs[0].submittedAt) : matchStart
      const user2LastActive = user2Proofs[0] ? new Date(user2Proofs[0].submittedAt) : matchStart

      const user1Inactive = user1LastActive < threeDaysAgo
      const user2Inactive = user2LastActive < threeDaysAgo

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

export async function runDailyTestingReminders() {
  console.log("⏰ Sending daily testing reminders to active testers...")

  try {
    const activeMatches = await db.query.matches.findMany({
      where: eq(matches.status, "active"),
      with: {
        user1: true,
        user2: true,
        app1: true,
        app2: true,
      },
    })

    for (const match of activeMatches) {
      if (match.user1?.pushToken) {
        await sendExpoPushNotification({
          to: match.user1.pushToken,
          title: "Daily Testing Reminder 📱",
          body: `Don't forget to open and test ${match.app2.title} today to keep your streak!`,
          data: { matchId: match.id },
        })
      }

      if (match.user2?.pushToken) {
        await sendExpoPushNotification({
          to: match.user2.pushToken,
          title: "Daily Testing Reminder 📱",
          body: `Don't forget to open and test ${match.app1.title} today to keep your streak!`,
          data: { matchId: match.id },
        })
      }
    }
  } catch (error) {
    console.error("❌ Failed to send daily testing reminders:", error)
  }
}

export function startBackgroundJobs() {
  if (process.env.NODE_ENV === "test") return

  console.log("🚀 Starting background cron timers...")

  // Run daily streak & match progression & expired bans maintenance every 4 hours
  const t1 = setInterval(
    () => {
      runDailyStreakMaintenance()
      runMatchProgressionAndCleanup()
      runExpiredBansCleanup()
    },
    4 * 60 * 60 * 1000,
  )
  t1.unref?.()

  // Run daily testing push reminders every 12 hours
  const t2 = setInterval(
    () => {
      runDailyTestingReminders()
    },
    12 * 60 * 60 * 1000,
  )
  t2.unref?.()

  // Run DB cleanups (notifications >7d, old matches >60d) every 24 hours
  const t3 = setInterval(
    () => {
      runNotificationCleanup()
      runOldMatchesCleanup()
    },
    24 * 60 * 60 * 1000,
  )
  t3.unref?.()

  // Trigger initial checks on boot
  runMatchProgressionAndCleanup()
  runNotificationCleanup()
  runExpiredBansCleanup()
  runOldMatchesCleanup()
}
