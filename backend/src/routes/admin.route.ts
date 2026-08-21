import { createRoute, z } from "@hono/zod-openapi"
import { and, asc, count, desc, eq, ilike, or } from "drizzle-orm"
import * as HttpStatusCodes from "stoker/http-status-codes"
import { jsonContent, jsonContentRequired } from "stoker/openapi/helpers"
import { createMessageObjectSchema } from "stoker/openapi/schemas"

import { db } from "../db"
import {
  adminChats,
  adminMessages,
  analytics,
  appBans,
  apps,
  matches,
  proofs,
  reports,
  userBans,
  users,
  userWarnings,
} from "../db/schema"
import { createRouter } from "../lib/create-app"
import { adminAuthMiddleware, authMiddleware } from "../middlewares/auth"

const ReportSchema = z.object({
  id: z.string(),
  reporterId: z.string(),
  type: z.enum([
    "dispute",
    "app_spam",
    "toxic_user",
    "other",
    "app_broken",
    "app_not_visible",
    "user_unresponsive",
  ]),
  targetId: z.string(),
  matchId: z.string().nullable().optional(),
  description: z.string(),
  screenshots: z.array(z.string()),
  status: z.enum(["pending", "resolved", "dismissed"]),
  adminNotes: z.string().nullable().optional(),
  actionTaken: z.string().nullable().optional(),
  resolvedAt: z.string().or(z.date()).nullable().optional(),
  createdAt: z.string().or(z.date()),
})

const CreateReportSchema = z.object({
  type: z.enum([
    "dispute",
    "app_spam",
    "toxic_user",
    "other",
    "app_broken",
    "app_not_visible",
    "user_unresponsive",
  ]),
  targetId: z.string(),
  matchId: z.string().optional(),
  reportedUserId: z.string().optional(),
  reportedAppId: z.string().optional(),
  description: z.string().min(5),
  screenshots: z.array(z.string().url()).default([]),
})

const BanUserSchema = z.object({
  userId: z.string(),
  reason: z.string().min(3),
  permanent: z.boolean().default(true),
})

const BanAppSchema = z.object({
  packageName: z.string().min(3),
  playStoreUrl: z.string().url(),
  title: z.string(),
  reason: z.string().min(3),
})

const AdminChatSchema = z.object({
  id: z.string(),
  userId: z.string(),
  adminId: z.string().nullable().optional(),
  lastMessage: z.string(),
  updatedAt: z.string().or(z.date()),
  hasUnreadUser: z.boolean(),
  hasUnreadAdmin: z.boolean(),
})

const AdminChatWithUserSchema = z.object({
  id: z.string(),
  userId: z.string(),
  adminId: z.string().nullable().optional(),
  lastMessage: z.string(),
  updatedAt: z.string().or(z.date()),
  hasUnreadUser: z.boolean(),
  hasUnreadAdmin: z.boolean(),
  user: z
    .object({
      id: z.string(),
      name: z.string(),
      email: z.string(),
      avatarUrl: z.string().nullable().optional(),
    })
    .nullable()
    .optional(),
})

const AdminUserListItemSchema = z.object({
  id: z.string(),
  tokenIdentifier: z.string().nullable().optional(),
  name: z.string(),
  email: z.string(),
  avatarUrl: z.string().nullable().optional(),
  reputation: z.number(),
  appsCount: z.number(),
  isAdmin: z.boolean(),
  isGroupMember: z.boolean(),
  streak: z.number(),
  bestStreak: z.number(),
  createdAt: z.string().or(z.date()),
})

const AdminMessageSchema = z.object({
  id: z.string(),
  chatId: z.string(),
  senderId: z.string(),
  content: z.string(),
  type: z.enum(["text", "image"]),
  isAdmin: z.boolean(),
  sentAt: z.string().or(z.date()),
})

const SendAdminMessageSchema = z.object({
  content: z.string().min(1),
  type: z.enum(["text", "image"]).default("text"),
})

const router = createRouter()

// 1. Submit a Report (Authenticated user)
router.openapi(
  createRoute({
    tags: ["Reports & Moderation"],
    method: "post",
    path: "/api/reports",
    summary: "Submit Dispute or Violation Report",
    middleware: [authMiddleware] as const,
    request: {
      body: jsonContentRequired(CreateReportSchema, "Report Payload"),
    },
    responses: {
      [HttpStatusCodes.CREATED]: jsonContent(ReportSchema, "Report created"),
    },
  }),
  async (c) => {
    const userVar = c.get("user")!
    const body = c.req.valid("json")

    const [newReport] = await db
      .insert(reports)
      .values({
        reporterId: userVar.id,
        type: body.type,
        targetId: body.targetId,
        matchId: body.matchId,
        reportedUserId: body.reportedUserId,
        reportedAppId: body.reportedAppId,
        description: body.description,
        screenshots: body.screenshots,
        status: "pending",
      })
      .returning()

    return c.json(newReport, HttpStatusCodes.CREATED)
  },
)

// 2. List Reports (Admin Only)
router.openapi(
  createRoute({
    tags: ["Admin"],
    method: "get",
    path: "/api/admin/reports",
    summary: "List Moderation Reports",
    middleware: [adminAuthMiddleware] as const,
    request: {
      query: z.object({
        status: z.enum(["all", "pending", "resolved", "dismissed"]).default("pending"),
      }),
    },
    responses: {
      [HttpStatusCodes.OK]: jsonContent(z.array(ReportSchema), "List of reports"),
    },
  }),
  async (c) => {
    const { status } = c.req.valid("query")
    const conditions = []

    if (status !== "all") {
      conditions.push(eq(reports.status, status))
    }

    const items = await db.query.reports.findMany({
      where: conditions.length > 0 ? and(...conditions) : undefined,
      orderBy: [desc(reports.createdAt)],
    })

    return c.json(items, HttpStatusCodes.OK)
  },
)

// 3. Ban User (Admin Only)
router.openapi(
  createRoute({
    tags: ["Admin"],
    method: "post",
    path: "/api/admin/bans/user",
    summary: "Ban a User",
    middleware: [adminAuthMiddleware] as const,
    request: {
      body: jsonContentRequired(BanUserSchema, "User Ban Payload"),
    },
    responses: {
      [HttpStatusCodes.OK]: jsonContent(
        createMessageObjectSchema("User banned"),
        "User banned successfully",
      ),
    },
  }),
  async (c) => {
    const userVar = c.get("user")!
    const body = c.req.valid("json")

    await db.insert(userBans).values({
      userId: body.userId,
      bannedBy: userVar.id,
      bannedByType: "manual",
      reason: body.reason,
      permanent: body.permanent,
    })

    return c.json({ message: "User banned successfully" }, HttpStatusCodes.OK)
  },
)

// 4. Ban App (Admin Only)
router.openapi(
  createRoute({
    tags: ["Admin"],
    method: "post",
    path: "/api/admin/bans/app",
    summary: "Ban an App Package Name",
    middleware: [adminAuthMiddleware] as const,
    request: {
      body: jsonContentRequired(BanAppSchema, "App Ban Payload"),
    },
    responses: {
      [HttpStatusCodes.OK]: jsonContent(
        createMessageObjectSchema("App package banned"),
        "App banned successfully",
      ),
    },
  }),
  async (c) => {
    const userVar = c.get("user")!
    const body = c.req.valid("json")

    await db.insert(appBans).values({
      packageName: body.packageName,
      playStoreUrl: body.playStoreUrl,
      title: body.title,
      bannedBy: userVar.id,
      reason: body.reason,
    })

    // Also update existing apps with this package to archived
    await db
      .update(apps)
      .set({ status: "archived", updatedAt: new Date() })
      .where(eq(apps.packageName, body.packageName))

    return c.json({ message: "App package banned successfully" }, HttpStatusCodes.OK)
  },
)

// 5. Admin Dashboard Overview Stats
router.openapi(
  createRoute({
    tags: ["Admin"],
    method: "get",
    path: "/api/admin/stats",
    summary: "Get Platform Dashboard Stats",
    middleware: [adminAuthMiddleware] as const,
    responses: {
      [HttpStatusCodes.OK]: jsonContent(
        z.object({
          totalUsers: z.number(),
          totalApps: z.number(),
          activeMatches: z.number(),
          totalProofs: z.number(),
          pendingReports: z.number(),
        }),
        "Platform stats",
      ),
    },
  }),
  async (c) => {
    const [userCount] = await db.select({ value: count() }).from(users)
    const [appCount] = await db.select({ value: count() }).from(apps)
    const [matchCount] = await db
      .select({ value: count() })
      .from(matches)
      .where(eq(matches.status, "active"))
    const [proofCount] = await db.select({ value: count() }).from(proofs)
    const [reportCount] = await db
      .select({ value: count() })
      .from(reports)
      .where(eq(reports.status, "pending"))

    return c.json(
      {
        totalUsers: Number(userCount.value),
        totalApps: Number(appCount.value),
        activeMatches: Number(matchCount.value),
        totalProofs: Number(proofCount.value),
        pendingReports: Number(reportCount.value),
      },
      HttpStatusCodes.OK,
    )
  },
)

// 5b. Get All Support Chats (Admin)
router.openapi(
  createRoute({
    tags: ["Admin"],
    method: "get",
    path: "/api/admin/support/chats",
    summary: "List All User Support Conversations",
    middleware: [adminAuthMiddleware] as const,
    responses: {
      [HttpStatusCodes.OK]: jsonContent(
        z.array(AdminChatWithUserSchema),
        "List of all support chats",
      ),
    },
  }),
  async (c) => {
    const chats = await db.query.adminChats.findMany({
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

// 5c. List and Search All Users (Admin)
router.openapi(
  createRoute({
    tags: ["Admin"],
    method: "get",
    path: "/api/admin/users",
    summary: "List and Search All Users",
    middleware: [adminAuthMiddleware] as const,
    request: {
      query: z.object({
        search: z.string().optional(),
        limit: z.coerce.number().optional().default(50),
      }),
    },
    responses: {
      [HttpStatusCodes.OK]: jsonContent(
        z.array(AdminUserListItemSchema),
        "List of platform users",
      ),
    },
  }),
  async (c) => {
    const { search, limit = 50 } = c.req.valid("query")

    let condition = undefined
    if (search && search.trim()) {
      const term = `%${search.trim()}%`
      condition = or(
        ilike(users.name, term),
        ilike(users.email, term),
        ilike(users.tokenIdentifier, term),
      )
    }

    const userList = await db.query.users.findMany({
      where: condition,
      orderBy: [desc(users.createdAt)],
      limit: Math.min(limit, 100),
    })

    return c.json(userList, HttpStatusCodes.OK)
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
          userVar.tokenIdentifier
            ? eq(chatTable.userId, userVar.tokenIdentifier)
            : eq(chatTable.userId, userVar.id),
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
      [HttpStatusCodes.NOT_FOUND]: jsonContent(
        createMessageObjectSchema("Chat not found"),
        "Chat not found",
      ),
      [HttpStatusCodes.FORBIDDEN]: jsonContent(
        createMessageObjectSchema("Forbidden"),
        "Forbidden",
      ),
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

    const isOwner =
      chat.userId === userVar.id ||
      (userVar.tokenIdentifier && chat.userId === userVar.tokenIdentifier)

    if (!isOwner && !userVar.isAdmin) {
      return c.json({ message: "Forbidden" }, HttpStatusCodes.FORBIDDEN)
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
      [HttpStatusCodes.NOT_FOUND]: jsonContent(
        createMessageObjectSchema("Chat not found"),
        "Chat not found",
      ),
      [HttpStatusCodes.FORBIDDEN]: jsonContent(
        createMessageObjectSchema("Forbidden"),
        "Forbidden",
      ),
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
    const isOwner =
      chat.userId === userVar.id ||
      (userVar.tokenIdentifier && chat.userId === userVar.tokenIdentifier)

    if (!isOwner && !isAdmin) {
      return c.json({ message: "Forbidden" }, HttpStatusCodes.FORBIDDEN)
    }

    const [newMessage] = await db
      .insert(adminMessages)
      .values({
        chatId,
        senderId: userVar.id,
        content: body.content,
        type: body.type,
        isAdmin,
      })
      .returning()

    await db
      .update(adminChats)
      .set({
        lastMessage: body.content,
        hasUnreadUser: isAdmin ? true : chat.hasUnreadUser,
        hasUnreadAdmin: !isAdmin ? true : chat.hasUnreadAdmin,
        adminId: isAdmin ? userVar.id : chat.adminId,
        updatedAt: new Date(),
      })
      .where(eq(adminChats.id, chatId))

    return c.json(newMessage, HttpStatusCodes.CREATED)
  },
)

export default router
