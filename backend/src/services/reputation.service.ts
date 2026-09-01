import { sql } from "drizzle-orm"

import { db } from "../db"
import { reputationLogs, users } from "../db/schema"

export interface ChangeReputationParams {
  userId: string
  delta: number
  reason: string
  referenceId?: string
  tx?: any
}

export class ReputationService {
  /**
   * Modifies a user's reputation score with automatic clamping at 0 and writes
   * an entry into the reputation_logs audit trail.
   * Can participate in an active transaction by passing `tx`.
   */
  static async changeReputation(params: ChangeReputationParams): Promise<void> {
    const { userId, delta, reason, referenceId, tx } = params
    const executor = tx || db

    if (delta === 0) return

    if (delta > 0) {
      await executor
        .update(users)
        .set({ reputation: sql`${users.reputation} + ${delta}` })
        .where(sql`${users.id} = ${userId}`)
    } else {
      const penalty = Math.abs(delta)
      await executor
        .update(users)
        .set({ reputation: sql`GREATEST(0, ${users.reputation} - ${penalty})` })
        .where(sql`${users.id} = ${userId}`)
    }

    // Record audit ledger entry
    await executor
      .insert(reputationLogs)
      .values({
        userId,
        delta,
        reason,
        referenceId,
      })
      .catch((err: any) => {
        console.error(`Failed to record reputation log for user ${userId}:`, err)
      })
  }
}
