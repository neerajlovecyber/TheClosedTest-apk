import { Cron } from "croner"

import { runExpiredBansCleanup, runNotificationCleanup, runReputationLogsCleanup } from "./cleanup-worker"
import { CRON_LOCKS, withAdvisoryLock } from "./constants"
import { runMatchProgressionAndCleanup, runOldMatchesCleanup } from "./match-worker"
import { runDailyTestingReminders } from "./reminder-worker"
import { runDailyStreakMaintenance } from "./streak-worker"

// Re-export all workers so external consumers and tests retain full backward compatibility
export {
  runDailyStreakMaintenance,
  runMatchProgressionAndCleanup,
  runNotificationCleanup,
  runExpiredBansCleanup,
  runOldMatchesCleanup,
  runReputationLogsCleanup,
  runDailyTestingReminders,
  withAdvisoryLock,
  CRON_LOCKS,
}

const activeCrons: Cron[] = []

export function stopCronJobs() {
  console.log("🛑 Stopping background cron schedulers...")
  for (const job of activeCrons) {
    try {
      job.stop()
    } catch {}
  }
  activeCrons.length = 0
}

export function startCronJobs() {
  if (process.env.NODE_ENV === "test") return

  console.log("🚀 Initializing Croner background schedulers with PG Advisory Locks (Asia/Kolkata)...")

  // 1. Midnight IST Streak Check & Penalty Maintenance (00:00 IST)
  activeCrons.push(
    new Cron("0 0 * * *", { timezone: "Asia/Kolkata", name: "daily-streak" }, async () => {
      console.log("🌙 Triggering Midnight IST Streak Maintenance...")
      await withAdvisoryLock(CRON_LOCKS.DAILY_STREAK, "Midnight IST Streak Maintenance", runDailyStreakMaintenance)
    }),
  )

  // 2. Active Match Progression, Inactivity Auto-Cancellation, and Expired Bans (Daily at 11:00 PM IST)
  activeCrons.push(
    new Cron("0 23 * * *", { timezone: "Asia/Kolkata", name: "match-maintenance" }, async () => {
      console.log("🔄 Triggering Nightly Match Progression & Inactivity Check (11:00 PM IST)...")
      await withAdvisoryLock(CRON_LOCKS.MATCH_MAINTENANCE, "Match Progression & Ban Expirations", async () => {
        await runMatchProgressionAndCleanup()
        await runExpiredBansCleanup()
      })
    }),
  )

  // 3. Testing & Review Push Reminders (10:00 AM, 3:00 PM, and 8:00 PM IST)
  activeCrons.push(
    new Cron("0 10,15,20 * * *", { timezone: "Asia/Kolkata", name: "daily-reminders" }, async () => {
      console.log("🔔 Triggering Daily Testing & Review Push Reminders...")
      await withAdvisoryLock(
        CRON_LOCKS.DAILY_REMINDERS,
        "Daily Testing & Review Push Reminders",
        runDailyTestingReminders,
      )
    }),
  )

  // 4. Nightly DB Cleanups (Notifications >7d, Old Matches >60d, Reputation Logs >60d) at 03:00 AM IST
  activeCrons.push(
    new Cron("0 3 * * *", { timezone: "Asia/Kolkata", name: "db-cleanup" }, async () => {
      console.log("🧹 Triggering Nightly Database Cleanup...")
      await withAdvisoryLock(CRON_LOCKS.DB_CLEANUP, "Nightly Database Cleanup", async () => {
        await runNotificationCleanup()
        await runOldMatchesCleanup()
        await runReputationLogsCleanup()
      })
    }),
  )

  // Initial maintenance checks on server boot (data cleanups only, NO mid-day match cancellation)
  withAdvisoryLock(CRON_LOCKS.BOOT_CLEANUP, "Server Boot Cleanup", async () => {
    await runNotificationCleanup()
    await runExpiredBansCleanup()
    await runOldMatchesCleanup()
    await runReputationLogsCleanup()
  })
}

export const startBackgroundJobs = startCronJobs
