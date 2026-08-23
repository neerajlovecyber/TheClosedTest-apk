import { createRoute, z } from "@hono/zod-openapi"
import { asc, desc, eq } from "drizzle-orm"
import * as HttpStatusCodes from "stoker/http-status-codes"
import { jsonContent, jsonContentRequired } from "stoker/openapi/helpers"
import { createMessageObjectSchema } from "stoker/openapi/schemas"

import { db } from "../../db"
import { adminChats, adminMessages } from "../../db/schema"
import { createRouter } from "../../lib/create-app"
import { adminAuthMiddleware, authMiddleware } from "../../middlewares/auth"
import { AdminChatSchema, AdminChatWithUserSchema, AdminMessageSchema, SendAdminMessageSchema } from "./schemas"

const router = createRouter()

// 5b. Get All Support Chats (Admin)
router.openapi(
  createRoute({
    tags: ["Admin"],
    method: "get",
    path: "/api/admin/support/chats",
    summary: "List All User Support Conversations",
    middleware: [adminAuthMiddleware] as const,
    responses: {
      [HttpStatusCodes.OK]: jsonContent(z.array(AdminChatWithUserSchema), "List of all support chats"),
    },
  }),
  async (c) => {
    const chats = await db.query.adminChats.findMany({
      where: (chatTable, { and, ne, isNotNull }) =>
        and(ne(chatTable.lastMessage, ""), isNotNull(chatTable.lastMessage)),
      orderBy: [desc(adminChats.updatedAt)],
      with: {
        user: {
          columns: {
            id: true,
            name: true,
            email: true,
            avatarUrl: true,
          },
        },
      },
    })

    return c.json(chats, HttpStatusCodes.OK)
  },
)

// 5d. Get or Create Support Chat for Specific User (Admin)
router.openapi(
  createRoute({
    tags: ["Admin"],
    method: "post",
    path: "/api/admin/support/chats/user/:userId",
    summary: "Get or Create Support Chat for a Specific User",
    middleware: [adminAuthMiddleware] as const,
    request: {
      params: z.object({ userId: z.string() }),
    },
    responses: {
      [HttpStatusCodes.OK]: jsonContent(AdminChatSchema, "Support chat details"),
      [HttpStatusCodes.NOT_FOUND]: jsonContent(createMessageObjectSchema("User not found"), "User not found"),
    },
  }),
  async (c) => {
    const { userId: targetUserId } = c.req.valid("param")
    const adminUser = c.get("user")!

    // Verify target user exists
    const targetUser = await db.query.users.findFirst({
      where: (u, { or, eq }) => or(eq(u.id, targetUserId), eq(u.tokenIdentifier, targetUserId)),
    })

    if (!targetUser) {
      return c.json({ message: "User not found" }, HttpStatusCodes.NOT_FOUND)
    }

    const existingChat = await db.query.adminChats.findFirst({
      where: (chatTable, { or, eq }) =>
        or(
          eq(chatTable.userId, targetUser.id),
          targetUser.tokenIdentifier
            ? eq(chatTable.userId, targetUser.tokenIdentifier)
            : eq(chatTable.userId, targetUser.id),
        ),
    })

    if (existingChat) {
      return c.json(existingChat, HttpStatusCodes.OK)
    }

    const [newChat] = await db
      .insert(adminChats)
      .values({
        userId: targetUser.id,
        adminId: adminUser.id,
        lastMessage: "",
        hasUnreadUser: false,
        hasUnreadAdmin: false,
      })
      .returning()

    return c.json(newChat, HttpStatusCodes.OK)
  },
)

// 6. Get or Create My Support Chat (User)
router.openapi(
  createRoute({
    tags: ["Support"],
    method: "post",
    path: "/api/support/my-chat",
    summary: "Get or Create Support Chat",
    middleware: [authMiddleware] as const,
    responses: {
      [HttpStatusCodes.OK]: jsonContent(AdminChatSchema, "User support chat"),
    },
  }),
  async (c) => {
    const userVar = c.get("user")!

    const existingChat = await db.query.adminChats.findFirst({
      where: (chatTable, { or, eq }) =>
        or(
          eq(chatTable.userId, userVar.id),
          userVar.tokenIdentifier ? eq(chatTable.userId, userVar.tokenIdentifier) : eq(chatTable.userId, userVar.id),
        ),
    })

    if (existingChat) {
      return c.json(existingChat, HttpStatusCodes.OK)
    }

    const [newChat] = await db
      .insert(adminChats)
      .values({
        userId: userVar.id,
        lastMessage: "",
        hasUnreadUser: false,
        hasUnreadAdmin: false,
      })
      .returning()

    return c.json(newChat, HttpStatusCodes.OK)
  },
)

// 7. Get Support Chat Messages
router.openapi(
  createRoute({
    tags: ["Support"],
    method: "get",
    path: "/api/support/chats/:chatId",
    summary: "Get Support Chat History",
    middleware: [authMiddleware] as const,
    request: {
      params: z.object({ chatId: z.string() }),
    },
    responses: {
      [HttpStatusCodes.OK]: jsonContent(
        z.object({
          chat: AdminChatSchema,
          messages: z.array(AdminMessageSchema),
        }),
        "Support chat history",
      ),
      [HttpStatusCodes.NOT_FOUND]: jsonContent(createMessageObjectSchema("Chat not found"), "Chat not found"),
      [HttpStatusCodes.FORBIDDEN]: jsonContent(createMessageObjectSchema("Forbidden"), "Forbidden"),
    },
  }),
  async (c) => {
    const { chatId } = c.req.valid("param")
    const userVar = c.get("user")!

    const chat = await db.query.adminChats.findFirst({
      where: eq(adminChats.id, chatId),
    })

    if (!chat) {
      return c.json({ message: "Chat not found" }, HttpStatusCodes.NOT_FOUND)
    }

    const isAdmin = Boolean(userVar.isAdmin)
    const isOwner = chat.userId === userVar.id || (userVar.tokenIdentifier && chat.userId === userVar.tokenIdentifier)

    if (!isOwner && !isAdmin) {
      return c.json({ message: "Forbidden" }, HttpStatusCodes.FORBIDDEN)
    }

    // Mark as read when opened
    const updateData: { hasUnreadAdmin?: boolean; hasUnreadUser?: boolean } = {}
    if (isAdmin && chat.hasUnreadAdmin) {
      updateData.hasUnreadAdmin = false
      chat.hasUnreadAdmin = false
    }
    if (isOwner && chat.hasUnreadUser) {
      updateData.hasUnreadUser = false
      chat.hasUnreadUser = false
    }
    if (Object.keys(updateData).length > 0) {
      await db.update(adminChats).set(updateData).where(eq(adminChats.id, chatId))
    }

    const messages = await db.query.adminMessages.findMany({
      where: eq(adminMessages.chatId, chatId),
      orderBy: [asc(adminMessages.sentAt)],
    })

    return c.json({ chat, messages }, HttpStatusCodes.OK)
  },
)

// 8. Send Message in Support Chat
router.openapi(
  createRoute({
    tags: ["Support"],
    method: "post",
    path: "/api/support/chats/:chatId/messages",
    summary: "Send Message in Support Chat",
    middleware: [authMiddleware] as const,
    request: {
      params: z.object({ chatId: z.string() }),
      body: jsonContentRequired(SendAdminMessageSchema, "Support Message Payload"),
    },
    responses: {
      [HttpStatusCodes.CREATED]: jsonContent(AdminMessageSchema, "Message sent"),
      [HttpStatusCodes.NOT_FOUND]: jsonContent(createMessageObjectSchema("Chat not found"), "Chat not found"),
      [HttpStatusCodes.FORBIDDEN]: jsonContent(createMessageObjectSchema("Forbidden"), "Forbidden"),
    },
  }),
  async (c) => {
    const { chatId } = c.req.valid("param")
    const userVar = c.get("user")!
    const body = c.req.valid("json")

    const chat = await db.query.adminChats.findFirst({
      where: eq(adminChats.id, chatId),
    })

    if (!chat) {
      return c.json({ message: "Chat not found" }, HttpStatusCodes.NOT_FOUND)
    }

    const isAdmin = Boolean(userVar.isAdmin)
    const isOwner = chat.userId === userVar.id || (userVar.tokenIdentifier && chat.userId === userVar.tokenIdentifier)

    if (!isOwner && !isAdmin) {
      return c.json({ message: "Forbidden" }, HttpStatusCodes.FORBIDDEN)
    }

    // If the sender is the owner of this support chat, they are sending as the User
    // (even if their account has admin role). Only when replying to another user's chat are they acting as admin.
    const isSendingAsAdmin = isAdmin && !isOwner

    const [newMessage] = await db
      .insert(adminMessages)
      .values({
        chatId,
        senderId: userVar.id,
        content: body.content,
        type: body.type,
        isAdmin: isSendingAsAdmin,
      })
      .returning()

    await db
      .update(adminChats)
      .set({
        lastMessage: body.content,
        hasUnreadUser: isSendingAsAdmin ? true : false,
        hasUnreadAdmin: isSendingAsAdmin ? false : true,
        adminId: isSendingAsAdmin ? userVar.id : chat.adminId,
        updatedAt: new Date(),
      })
      .where(eq(adminChats.id, chatId))

    return c.json(newMessage, HttpStatusCodes.CREATED)
  },
)

export default router
