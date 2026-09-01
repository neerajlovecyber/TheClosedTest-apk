import { createRoute, z } from "@hono/zod-openapi"
import * as HttpStatusCodes from "stoker/http-status-codes"
import { jsonContent, jsonContentRequired } from "stoker/openapi/helpers"
import { createMessageObjectSchema } from "stoker/openapi/schemas"

import { MessagesController } from "../controllers/messages.controller"
import { createRouter } from "../lib/create-app"
import { authMiddleware } from "../middlewares/auth"

const MessageSchema = z.object({
  id: z.string(),
  matchId: z.string(),
  senderId: z.string(),
  content: z.string(),
  type: z.enum(["text", "image", "video"]),
  storageUrl: z.string().nullable().optional(),
  sender: z.any().optional(),
  sentAt: z.string().or(z.date()),
})

const SendMessageSchema = z.object({
  content: z.string().min(1),
  type: z.enum(["text", "image", "video"]).default("text"),
  storageUrl: z.string().nullable().optional(),
})

const router = createRouter()

// 1. Get Match Chat History
router.openapi(
  createRoute({
    tags: ["Messages"],
    method: "get",
    path: "/api/messages/:matchId",
    summary: "Get Match Chat Messages",
    middleware: [authMiddleware] as const,
    request: {
      params: z.object({ matchId: z.string() }),
      query: z.object({
        limit: z.coerce.number().default(50),
        offset: z.coerce.number().default(0),
      }),
    },
    responses: {
      [HttpStatusCodes.OK]: jsonContent(z.array(MessageSchema), "Chat messages"),
      [HttpStatusCodes.FORBIDDEN]: jsonContent(createMessageObjectSchema("Forbidden"), "Forbidden"),
    },
  }),
  MessagesController.getHistory,
)

// 2. Send Message
router.openapi(
  createRoute({
    tags: ["Messages"],
    method: "post",
    path: "/api/messages/:matchId",
    summary: "Send Message in Match Chat",
    middleware: [authMiddleware] as const,
    request: {
      params: z.object({ matchId: z.string() }),
      body: jsonContentRequired(SendMessageSchema, "Message Payload"),
    },
    responses: {
      [HttpStatusCodes.CREATED]: jsonContent(MessageSchema, "Message sent"),
      [HttpStatusCodes.FORBIDDEN]: jsonContent(createMessageObjectSchema("Forbidden"), "Forbidden"),
    },
  }),
  MessagesController.sendMessage,
)

// 3. Mark Chat as Read
router.openapi(
  createRoute({
    tags: ["Messages"],
    method: "post",
    path: "/api/messages/:matchId/read",
    summary: "Mark Messages as Read",
    middleware: [authMiddleware] as const,
    request: {
      params: z.object({ matchId: z.string() }),
    },
    responses: {
      [HttpStatusCodes.OK]: jsonContent(createMessageObjectSchema("Chat marked as read"), "Marked as read"),
      [HttpStatusCodes.FORBIDDEN]: jsonContent(createMessageObjectSchema("Forbidden"), "Forbidden"),
    },
  }),
  MessagesController.markRead,
)

export default router
