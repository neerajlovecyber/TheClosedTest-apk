import { createRoute, z } from "@hono/zod-openapi"
import * as HttpStatusCodes from "stoker/http-status-codes"
import { jsonContent, jsonContentRequired } from "stoker/openapi/helpers"

import { StorageController } from "../controllers/storage.controller"
import { createRouter } from "../lib/create-app"
import { authMiddleware } from "../middlewares/auth"
import { sensitiveActionLimiter } from "../middlewares/rate-limiter"

export const ALLOWED_IMAGE_MIME_TYPES = [
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
  "image/gif",
  "image/heic",
  "image/heif",
] as const

const StoragePresignedRequestSchema = z.object({
  filename: z.string().min(1).max(255),
  contentType: z.enum(ALLOWED_IMAGE_MIME_TYPES),
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
    middleware: [authMiddleware, sensitiveActionLimiter] as const,
    request: {
      body: jsonContentRequired(StoragePresignedRequestSchema, "File Upload Request"),
    },
    responses: {
      [HttpStatusCodes.OK]: jsonContent(StoragePresignedResponseSchema, "Presigned upload URL details"),
    },
  }),
  StorageController.getPresignedUrl,
)

export default router
