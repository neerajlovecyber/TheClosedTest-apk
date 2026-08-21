import { and, eq, lt, sql } from "drizzle-orm"

import { db } from "../db"
import { boostCycles, boostLeaderboard, matches, users } from "../db/schema"
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
  console.log("⏰ Running match completion and cleanup checks...")

  try {
    // Find active matches where both users completed 14 approved days
    const activeMatches = await db.query.matches.findMany({
      where: and(
        eq(matches.status, "active"),
        sql`${matches.user1ApprovedCount} >= 14`,
        sql`${matches.user2ApprovedCount} >= 14`,
      ),
    })

    for (const match of activeMatches) {
      console.log(`🎉 Auto-completing 14-day match ${match.id}...`)
      await db
        .update(matches)
        .set({
          status: "completed",
          completedAt: new Date(),
          updatedAt: new Date(),
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

    // Auto-expire stale pending requests older than 7 days
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
    await db
      .update(matches)
      .set({
        status: "cancelled",
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(matches.status, "pending"),
          lt(matches.createdAt, sevenDaysAgo),
        ),
      )
  } catch (error) {
    console.error("❌ Failed match progression check:", error)
  }
}

export async function runBoostCycleMaintenance() {
  console.log("⏰ Checking 48h boost cycle...")

  try {
    const currentCycle = await db.query.boostCycles.findFirst({
      orderBy: (bc, { desc }) => [desc(bc.cycleEnd)],
    })

    const now = new Date()

    if (!currentCycle || currentCycle.cycleEnd < now) {
      console.log("🔄 Resetting boost cycle and starting new 48h period...")

      const cycleStart = now
      const cycleEnd = new Date(now.getTime() + 48 * 60 * 60 * 1000)

      await db.insert(boostCycles).values({
        cycleStart,
        cycleEnd,
      })

      // Reset leaderboard scores
      await db.update(boostLeaderboard).set({ boostScore: 0, updatedAt: now })
    }
  } catch (error) {
    console.error("❌ Failed to maintain boost cycle:", error)
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
  console.log("🚀 Starting background cron timers...")

  // Run boost cycle check every hour
  setInterval(() => {
    runBoostCycleMaintenance()
  }, 60 * 60 * 1000)

  // Run daily streak & match progression maintenance every 4 hours
  setInterval(() => {
    runDailyStreakMaintenance()
    runMatchProgressionAndCleanup()
  }, 4 * 60 * 60 * 1000)

  // Trigger initial checks on boot
  runBoostCycleMaintenance()
  runMatchProgressionAndCleanup()
}
