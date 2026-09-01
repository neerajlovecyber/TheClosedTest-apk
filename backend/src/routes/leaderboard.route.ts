import { createRoute, z } from "@hono/zod-openapi"
import * as HttpStatusCodes from "stoker/http-status-codes"
import { jsonContent } from "stoker/openapi/helpers"

import { LeaderboardController } from "../controllers/leaderboard.controller"
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
  LeaderboardController.getLeaderboard,
)

export default router
