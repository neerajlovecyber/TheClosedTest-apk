import { desc } from "drizzle-orm"

import { db } from "../db"
import { boostCycles, boostLeaderboard } from "../db/schema"
import { memoryCache } from "../lib/cache"

export interface LeaderboardItem {
  id: string
  userId: string
  appId?: string | null
  boostScore: number
  user?: {
    name: string
    avatarUrl?: string | null
    reputation: number
  }
}

export interface LeaderboardResponse {
  leaderboard: LeaderboardItem[]
  cycleEnd?: string | Date | null
}

export class LeaderboardService {
  static async getLeaderboard(limit = 20): Promise<LeaderboardResponse> {
    const cacheKey = `leaderboard:${limit}`

    const cached = memoryCache.get<LeaderboardResponse>(cacheKey)
    if (cached) {
      return cached
    }

    const entries = await db.query.boostLeaderboard.findMany({
      orderBy: [desc(boostLeaderboard.boostScore)],
      limit,
    })

    const currentCycle = await db.query.boostCycles.findFirst({
      orderBy: [desc(boostCycles.cycleEnd)],
    })

    const responseData: LeaderboardResponse = {
      leaderboard: entries as LeaderboardItem[],
      cycleEnd: currentCycle?.cycleEnd || null,
    }

    memoryCache.set(cacheKey, responseData, 10)

    return responseData
  }
}
