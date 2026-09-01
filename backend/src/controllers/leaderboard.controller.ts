import type { Context } from "hono"
import * as HttpStatusCodes from "stoker/http-status-codes"

import { LeaderboardService } from "../services/leaderboard.service"

export class LeaderboardController {
  static async getLeaderboard(c: Context) {
    const { limit } = c.req.valid("query" as never) as { limit: number }
    const result = await LeaderboardService.getLeaderboard(limit)
    return c.json(result, HttpStatusCodes.OK)
  }
}
