import { createRoute, z } from "@hono/zod-openapi"
import { asc, desc, eq, sql } from "drizzle-orm"
import * as HttpStatusCodes from "stoker/http-status-codes"
import { jsonContent, jsonContentRequired } from "stoker/openapi/helpers"
import { createMessageObjectSchema } from "stoker/openapi/schemas"

import { db } from "../db"
import { matches, messages, notifications, users } from "../db/schema"
import { createRouter } from "../lib/create-app"
import { authMiddleware } from "../middlewares/auth"
import { sendExpoPushNotification } from "../services/expo-push"

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
  async (c) => {
    const { matchId } = c.req.valid("param")
    const { limit, offset } = c.req.valid("query")
    const userVar = c.get("user")!

    const match = await db.query.matches.findFirst({
      where: (m, { eq }) => eq(m.id, matchId),
    })

    if (!match || (match.user1Id !== userVar.id && match.user2Id !== userVar.id)) {
      return c.json({ message: "Forbidden: Not part of match" }, HttpStatusCodes.FORBIDDEN)
    }

    const items = await db.query.messages.findMany({
      where: (m, { eq }) => eq(m.matchId, matchId),
      with: {
        sender: true,
      },
      orderBy: [asc(messages.sentAt)],
      limit,
      offset,
    })

    return c.json(items, HttpStatusCodes.OK)
  },
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
  async (c) => {
    const { matchId } = c.req.valid("param")
    const userVar = c.get("user")!
    const body = c.req.valid("json")

    const match = await db.query.matches.findFirst({
      where: (m, { eq }) => eq(m.id, matchId),
    })

    if (!match || (match.user1Id !== userVar.id && match.user2Id !== userVar.id)) {
      return c.json({ message: "Forbidden: Not part of match" }, HttpStatusCodes.FORBIDDEN)
    }

    const isUser1 = match.user1Id === userVar.id
    const partnerId = isUser1 ? match.user2Id : match.user1Id
    const now = new Date()

    const [newMessage] = await db
      .insert(messages)
      .values({
        matchId,
        senderId: userVar.id,
        content: body.content,
        type: body.type,
        storageUrl: body.storageUrl,
      })
      .returning()

    // Update match lastActivity & lastRead for sender
    await db
      .update(matches)
      .set({
        lastActivity: now,
        ...(isUser1 ? { lastRead1: now } : { lastRead2: now }),
      })
      .where(eq(matches.id, matchId))

    // Send push notification to partner in background
    db.query.users
      .findFirst({
        where: (u, { eq }) => eq(u.id, partnerId),
      })
      .then((partner) => {
        if (partner?.pushToken) {
          sendExpoPushNotification({
            to: partner.pushToken,
            title: `Message from ${userVar.name || "Testing Partner"} 💬`,
            body: body.type === "text" ? body.content : "Sent an attachment",
            data: { matchId, messageId: newMessage.id },
          }).catch(() => {})
        }
      })
      .catch((err) => {
        console.error("Message push error:", err)
      })

    return c.json(newMessage, HttpStatusCodes.CREATED)
  },
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
  async (c) => {
    const { matchId } = c.req.valid("param")
    const userVar = c.get("user")!

    const match = await db.query.matches.findFirst({
      where: (m, { eq }) => eq(m.id, matchId),
    })

    if (!match || (match.user1Id !== userVar.id && match.user2Id !== userVar.id)) {
      return c.json({ message: "Forbidden: Not part of match" }, HttpStatusCodes.FORBIDDEN)
    }

    const isUser1 = match.user1Id === userVar.id
    const now = new Date()

    await db
      .update(matches)
      .set(isUser1 ? { lastRead1: now } : { lastRead2: now })
      .where(eq(matches.id, matchId))

    return c.json({ message: "Chat marked as read" }, HttpStatusCodes.OK)
  },
)

export default router
