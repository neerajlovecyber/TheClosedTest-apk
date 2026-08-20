import { createRoute } from "@hono/zod-openapi"
import * as HttpStatusCodes from "stoker/http-status-codes"
import { jsonContent } from "stoker/openapi/helpers"
import { createMessageObjectSchema } from "stoker/openapi/schemas"

import { createRouter } from "../lib/create-app"

const router = createRouter().openapi(
  createRoute({
    tags: ["Index"],
    method: "get",
    path: "/",
    summary: "Health Check & Welcome",
    description: "Returns health status of TheClosedTest API",
    responses: {
      [HttpStatusCodes.OK]: jsonContent(
        createMessageObjectSchema("TheClosedTest API is healthy"),
        "TheClosedTest API Index / Health Check",
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

export default router
