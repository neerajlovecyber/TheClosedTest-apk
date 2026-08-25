import { createRoute, z } from "@hono/zod-openapi"
import { sql } from "drizzle-orm"
import * as HttpStatusCodes from "stoker/http-status-codes"
import { jsonContent } from "stoker/openapi/helpers"
import { createMessageObjectSchema } from "stoker/openapi/schemas"

import { db } from "../db"
import { createRouter } from "../lib/create-app"

const router = createRouter()
  .openapi(
    createRoute({
      tags: ["Index"],
      method: "get",
      path: "/",
      summary: "Welcome & Health Check",
      description: "Returns health status of TheClosedTest API",
      responses: {
        [HttpStatusCodes.OK]: jsonContent(
          createMessageObjectSchema("TheClosedTest API is healthy"),
          "TheClosedTest API Index",
        ),
      },
    }),
    (c) => {
      return c.json(
        {
          message: "TheClosedTest API is healthy",
        },
        HttpStatusCodes.OK,
      )
    },
  )
  .openapi(
    createRoute({
      tags: ["Index"],
      method: "get",
      path: "/health",
      summary: "Comprehensive Health & Readiness Check",
      description: "Checks database connectivity, latency, memory usage, and uptime",
      responses: {
        [HttpStatusCodes.OK]: jsonContent(
          z.object({
            status: z.enum(["healthy", "degraded"]),
            database: z.string(),
            latencyMs: z.number(),
            uptimeSeconds: z.number(),
            memoryUsageMB: z.number(),
            timestamp: z.string(),
          }),
          "Health probe response",
        ),
        [HttpStatusCodes.SERVICE_UNAVAILABLE]: jsonContent(
          createMessageObjectSchema("Service unavailable"),
          "Service unavailable",
        ),
      },
    }),
    async (c) => {
      const startTime = performance.now()
      let dbStatus = "connected"

      try {
        await db.execute(sql`SELECT 1`)
      } catch {
        dbStatus = "disconnected"
        return c.json({ message: "Database disconnected" }, HttpStatusCodes.SERVICE_UNAVAILABLE)
      }

      const latencyMs = Math.round((performance.now() - startTime) * 100) / 100
      const memoryMB = Math.round((process.memoryUsage().rss / (1024 * 1024)) * 10) / 10

      return c.json(
        {
          status: "healthy" as const,
          database: dbStatus,
          latencyMs,
          uptimeSeconds: Math.round(process.uptime()),
          memoryUsageMB: memoryMB,
          timestamp: new Date().toISOString(),
        },
        HttpStatusCodes.OK,
      )
    },
  )

export default router
