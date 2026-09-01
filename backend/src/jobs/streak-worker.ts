import { and, sql } from "drizzle-orm"

import { db } from "../db"
import { users } from "../db/schema"

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
