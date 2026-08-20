import { createRoute, z } from "@hono/zod-openapi"
import * as HttpStatusCodes from "stoker/http-status-codes"
import { jsonContent, jsonContentRequired } from "stoker/openapi/helpers"

import { createRouter } from "../lib/create-app"
import { authMiddleware } from "../middlewares/auth"
import { generateUploadUrl } from "../services/r2-storage"

const StoragePresignedRequestSchema = z.object({
  filename: z.string().min(1),
  contentType: z.string().min(1),
  folder: z.enum(["proofs", "avatars", "icons", "messages", "reports"]).default("proofs"),
})

const StoragePresignedResponseSchema = z.object({
  uploadUrl: z.string(),
  publicUrl: z.string(),
  key: z.string(),
})

const router = createRouter()

router.openapi(
  createRoute({
    tags: ["Storage"],
    method: "post",
    path: "/api/storage/presigned-url",
    summary: "Get Presigned Upload URL for Cloudflare R2 / S3",
    middleware: [authMiddleware] as const,
    request: {
      body: jsonContentRequired(StoragePresignedRequestSchema, "File Upload Request"),
    },
    responses: {
      [HttpStatusCodes.OK]: jsonContent(
        StoragePresignedResponseSchema,
        "Presigned upload URL details",
      ),
    },
  }),
  async (c) => {
    const body = c.req.valid("json")
    const result = await generateUploadUrl(body)
    return c.json(result, HttpStatusCodes.OK)
  },
)

export default router
