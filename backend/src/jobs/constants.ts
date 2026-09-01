import { sql } from "drizzle-orm"

import { db } from "../db"

export const CRON_LOCKS = {
  DAILY_STREAK: 1001,
  MATCH_MAINTENANCE: 1002,
  DAILY_REMINDERS: 1003,
  DB_CLEANUP: 1004,
  BOOT_CLEANUP: 1005,
} as const

export async function withAdvisoryLock(lockId: number, taskName: string, task: () => Promise<void>) {
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
    // Fallback to running task directly if lock management fails
    await task()
  }
}
