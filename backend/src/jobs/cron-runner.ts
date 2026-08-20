import { and, eq, lt, sql } from "drizzle-orm"

import { db } from "../db"
import { analytics, boostCycles, boostLeaderboard, matches, notifications, users } from "../db/schema"
import { sendExpoPushNotification } from "../services/expo-push"

export async function runDailyStreakMaintenance() {
  console.log("⏰ Running daily streak & activity maintenance...")

  const today = new Date().toISOString().split("T")[0]
  const yesterday = new Date(Date.now() - 86400000).toISOString().split("T")[0]

  try {
    // Reset streak to 0 for users who did not check in yesterday or today
    await db
      .update(users)
      .set({ streak: 0 })
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

  // Run daily streak maintenance every 6 hours
  setInterval(() => {
    runDailyStreakMaintenance()
  }, 6 * 60 * 60 * 1000)

  // Trigger initial checks on boot
  runBoostCycleMaintenance()
}
