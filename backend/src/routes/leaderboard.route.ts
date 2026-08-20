import { createRoute, z } from "@hono/zod-openapi"
import { desc, eq } from "drizzle-orm"
import * as HttpStatusCodes from "stoker/http-status-codes"
import { jsonContent } from "stoker/openapi/helpers"

import { db } from "../db"
import { boostCycles, boostLeaderboard } from "../db/schema"
import { memoryCache } from "../lib/cache"
import { createRouter } from "../lib/create-app"

const LeaderboardEntrySchema = z.object({
  id: z.string(),
  userId: z.string(),
  appId: z.string().nullable().optional(),
  boostScore: z.number(),
  user: z
    .object({
      name: z.string(),
      avatarUrl: z.string().nullable().optional(),
      reputation: z.number(),
    })
    .optional(),
})

type LeaderboardEntryType = z.infer<typeof LeaderboardEntrySchema>

interface LeaderboardResponse {
  leaderboard: LeaderboardEntryType[]
  cycleEnd: string | Date | null
}

const router = createRouter()

router.openapi(
  createRoute({
    tags: ["Leaderboard"],
    method: "get",
    path: "/api/leaderboard",
    summary: "Get Boost Score Leaderboard",
    request: {
      query: z.object({
        limit: z.coerce.number().default(20),
      }),
    },
    responses: {
      [HttpStatusCodes.OK]: jsonContent(
        z.object({
          leaderboard: z.array(LeaderboardEntrySchema),
          cycleEnd: z.string().or(z.date()).nullable().optional(),
        }),
        "Boost leaderboard",
      ),
    },
  }),
  async (c) => {
    const { limit } = c.req.valid("query")
    const cacheKey = `leaderboard:${limit}`

    const cached = memoryCache.get<LeaderboardResponse>(cacheKey)
    if (cached) {
      return c.json(cached, HttpStatusCodes.OK)
    }

    const entries = await db.query.boostLeaderboard.findMany({
      orderBy: [desc(boostLeaderboard.boostScore)],
      limit,
    })

    const currentCycle = await db.query.boostCycles.findFirst({
      orderBy: [desc(boostCycles.cycleEnd)],
    })

    const responseData: LeaderboardResponse = {
      leaderboard: entries,
      cycleEnd: currentCycle?.cycleEnd || null,
    }

    memoryCache.set(cacheKey, responseData, 10)

    return c.json(responseData, HttpStatusCodes.OK)
  },
)

export default router
