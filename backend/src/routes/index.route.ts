import { createRoute, z } from "@hono/zod-openapi"
import * as HttpStatusCodes from "stoker/http-status-codes"
import { jsonContent } from "stoker/openapi/helpers"
import { createMessageObjectSchema } from "stoker/openapi/schemas"

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
      summary: "Docker & Cloud Health Check",
      description: "Returns 200 OK for Docker, Kubernetes, and Cloud health probes",
      responses: {
        [HttpStatusCodes.OK]: jsonContent(
          z.object({
            status: z.literal("healthy"),
            timestamp: z.string(),
          }),
          "Health probe response",
        ),
      },
    }),
    (c) => {
      return c.json(
        {
          status: "healthy" as const,
          timestamp: new Date().toISOString(),
        },
        HttpStatusCodes.OK,
      )
    },
  )

export default router
