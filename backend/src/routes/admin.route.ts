import { createRoute, z } from "@hono/zod-openapi"
import { and, asc, count, desc, eq, ilike, inArray, not, or, sql } from "drizzle-orm"
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
  messages,
  proofs,
  reports,
  userBans,
  users,
  userWarnings,
} from "../db/schema"
import { memoryCache } from "../lib/cache"
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
  screenshots: z.array(z.string()).default([]),
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

// 4.1. Clean / Reset All Apps (Admin Only)
router.openapi(
  createRoute({
    tags: ["Admin"],
    method: "post",
    path: "/api/admin/apps/clean-all",
    summary: "Delete All Apps and Matches (Reset Marketplace)",
    middleware: [adminAuthMiddleware] as const,
    responses: {
      [HttpStatusCodes.OK]: jsonContent(
        z.object({
          message: z.string(),
          deletedAppsCount: z.number(),
        }),
        "Cleanup results",
      ),
    },
  }),
  async (c) => {
    // Delete in cascade order to satisfy foreign keys
    await db.delete(proofs)
    await db.delete(messages)
    await db.delete(reports)
    await db.delete(matches)
    await db.delete(appBans)
    const deleted = await db.delete(apps).returning()
    await db.update(users).set({ appsCount: 0 })

    return c.json(
      {
        message: "All apps, matches, and testing records have been cleanly deleted.",
        deletedAppsCount: deleted.length,
      },
      HttpStatusCodes.OK,
    )
  },
)

// 4b. Clean Simulated Test Users
router.openapi(
  createRoute({
    tags: ["Admin"],
    method: "post",
    path: "/api/admin/users/clean-test-users",
    summary: "Clean Simulated & Dummy Test Users",
    middleware: [adminAuthMiddleware] as const,
    responses: {
      [HttpStatusCodes.OK]: jsonContent(
        z.object({
          message: z.string(),
          deletedUsersCount: z.number(),
        }),
        "Test users cleanup results",
      ),
    },
  }),
  async (c) => {
    const userVar = c.get("user")!
    const ADMIN_EMAILS = [
      "neerajlovecyber@gmail.com",
      "futureaistudio41@gmail.com",
      "theneerajsec@gmail.com",
    ]

    const allUsers = await db.query.users.findMany()
    const testUsersToDelete = allUsers.filter((u) => {
      if (u.id === userVar.id || u.isAdmin) return false
      const emailLower = (u.email || "").toLowerCase()
      const tokenLower = (u.tokenIdentifier || "").toLowerCase()
      const nameLower = (u.name || "").toLowerCase()

      if (ADMIN_EMAILS.some((adminEmail) => emailLower.includes(adminEmail.toLowerCase()))) {
        return false
      }

      return (
        emailLower.includes("test") ||
        emailLower.includes("stress") ||
        emailLower.includes("dummy") ||
        emailLower.includes("example.com") ||
        tokenLower.includes("test") ||
        tokenLower.includes("stress") ||
        nameLower.includes("test user") ||
        nameLower.includes("tester #")
      )
    })

    if (testUsersToDelete.length === 0) {
      return c.json(
        { message: "No test users found to delete.", deletedUsersCount: 0 },
        HttpStatusCodes.OK,
      )
    }

    for (const testUser of testUsersToDelete) {
      await db.delete(proofs).where(eq(proofs.uploaderId, testUser.id))
      await db.delete(messages).where(eq(messages.senderId, testUser.id))
      await db
        .delete(reports)
        .where(or(eq(reports.reporterId, testUser.id), eq(reports.targetId, testUser.id)))
      await db
        .delete(matches)
        .where(or(eq(matches.user1Id, testUser.id), eq(matches.user2Id, testUser.id)))
      await db.delete(apps).where(eq(apps.userId, testUser.id))
      await db.delete(adminMessages).where(eq(adminMessages.senderId, testUser.id))
      await db.delete(adminChats).where(eq(adminChats.userId, testUser.id))
      await db.delete(userWarnings).where(eq(userWarnings.userId, testUser.id))
      await db.delete(userBans).where(eq(userBans.userId, testUser.id))
      await db.delete(users).where(eq(users.id, testUser.id))
    }

    return c.json(
      {
        message: `Successfully deleted ${testUsersToDelete.length} dummy test users.`,
        deletedUsersCount: testUsersToDelete.length,
      },
      HttpStatusCodes.OK,
    )
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
      [HttpStatusCodes.NOT_FOUND]: jsonContent(
        createMessageObjectSchema("User not found"),
        "User not found",
      ),
    },
  }),
  async (c) => {
    const { userId: targetUserId } = c.req.valid("param")
    const adminUser = c.get("user")!

    // Verify target user exists
    const targetUser = await db.query.users.findFirst({
      where: (u, { or, eq }) =>
        or(eq(u.id, targetUserId), eq(u.tokenIdentifier, targetUserId)),
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

    const isAdmin = Boolean(userVar.isAdmin)
    const isOwner =
      chat.userId === userVar.id ||
      (userVar.tokenIdentifier && chat.userId === userVar.tokenIdentifier)

    if (!isOwner && !isAdmin) {
      return c.json({ message: "Forbidden" }, HttpStatusCodes.FORBIDDEN)
    }

    // Mark as read when opened
    if (isAdmin && chat.hasUnreadAdmin) {
      await db
        .update(adminChats)
        .set({ hasUnreadAdmin: false })
        .where(eq(adminChats.id, chatId))
      chat.hasUnreadAdmin = false
    } else if (!isAdmin && chat.hasUnreadUser) {
      await db
        .update(adminChats)
        .set({ hasUnreadUser: false })
        .where(eq(adminChats.id, chatId))
      chat.hasUnreadUser = false
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
        hasUnreadUser: isAdmin ? true : false,
        hasUnreadAdmin: isAdmin ? false : true,
        adminId: isAdmin ? userVar.id : chat.adminId,
        updatedAt: new Date(),
      })
      .where(eq(adminChats.id, chatId))

    return c.json(newMessage, HttpStatusCodes.CREATED)
  },
)

// ===========================================================================
// 7. Admin App Management & Duplicate Cleaners
// ===========================================================================

const AdminAppItemSchema = z.object({
  id: z.string(),
  userId: z.string(),
  title: z.string(),
  packageName: z.string(),
  playStoreUrl: z.string(),
  iconUrl: z.string(),
  instructions: z.string(),
  requiredTesters: z.number(),
  currentTesters: z.number(),
  status: z.string(),
  visibilityStatus: z.string().nullable().optional(),
  flagCount: z.number(),
  positiveVotes: z.number(),
  negativeVotes: z.number(),
  createdAt: z.string().or(z.date()),
  updatedAt: z.string().or(z.date()),
  user: z
    .object({
      id: z.string(),
      name: z.string().nullable().optional(),
      email: z.string().nullable().optional(),
      avatarUrl: z.string().nullable().optional(),
      reputation: z.number().optional(),
    })
    .nullable()
    .optional(),
  isDuplicate: z.boolean().optional(),
})

// 7a. List All Apps for Admin with Search & Filter
router.openapi(
  createRoute({
    tags: ["Admin"],
    method: "get",
    path: "/api/admin/apps",
    summary: "List and Search All Apps (Admin)",
    middleware: [adminAuthMiddleware] as const,
    request: {
      query: z.object({
        search: z.string().optional(),
        status: z.string().optional(),
        limit: z.coerce.number().optional().default(50),
        offset: z.coerce.number().optional().default(0),
      }),
    },
    responses: {
      [HttpStatusCodes.OK]: jsonContent(
        z.object({
          apps: z.array(AdminAppItemSchema),
          total: z.number(),
          duplicatePackagesCount: z.number(),
        }),
        "Admin apps list",
      ),
    },
  }),
  async (c) => {
    const { search, status, limit = 50, offset = 0 } = c.req.valid("query")

    const conditions: any[] = []

    if (status && status !== "all") {
      conditions.push(eq(apps.status, status as any))
    }

    if (search && search.trim()) {
      const term = `%${search.trim()}%`
      conditions.push(
        or(
          ilike(apps.title, term),
          ilike(apps.packageName, term),
          ilike(users.name, term),
          ilike(users.email, term),
        )!,
      )
    }

    const rawApps = await db
      .select({
        app: apps,
        user: {
          id: users.id,
          name: users.name,
          email: users.email,
          avatarUrl: users.avatarUrl,
          reputation: users.reputation,
        },
      })
      .from(apps)
      .leftJoin(users, eq(apps.userId, users.id))
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(desc(apps.createdAt))
      .limit(limit)
      .offset(offset)

    // Check all active apps to identify duplicates
    const allActiveApps = await db.query.apps.findMany({
      where: not(eq(apps.status, "archived")),
      columns: { packageName: true, id: true },
    })

    const packageCountMap = new Map<string, number>()
    for (const a of allActiveApps) {
      const pkg = a.packageName.toLowerCase().trim()
      packageCountMap.set(pkg, (packageCountMap.get(pkg) || 0) + 1)
    }

    const duplicatePackagesCount = Array.from(packageCountMap.values()).filter((c) => c > 1).length

    const formatted = rawApps.map((r) => {
      const isDup = (packageCountMap.get(r.app.packageName.toLowerCase().trim()) || 0) > 1
      return {
        ...r.app,
        user: r.user,
        isDuplicate: isDup,
      }
    })

    return c.json(
      {
        apps: formatted,
        total: formatted.length,
        duplicatePackagesCount,
      },
      HttpStatusCodes.OK,
    )
  },
)

// 7b. Admin Delete Single App
router.openapi(
  createRoute({
    tags: ["Admin"],
    method: "delete",
    path: "/api/admin/apps/:id",
    summary: "Delete an App (Admin)",
    middleware: [adminAuthMiddleware] as const,
    request: {
      params: z.object({ id: z.string() }),
      query: z.object({
        banPackage: z.enum(["true", "false"]).optional(),
        reason: z.string().optional(),
      }),
    },
    responses: {
      [HttpStatusCodes.OK]: jsonContent(
        createMessageObjectSchema("App deleted"),
        "Deletion result",
      ),
      [HttpStatusCodes.NOT_FOUND]: jsonContent(
        createMessageObjectSchema("App not found"),
        "App not found",
      ),
    },
  }),
  async (c) => {
    const { id } = c.req.valid("param")
    const { banPackage, reason } = c.req.valid("query")
    const adminUser = c.get("user")!

    const targetApp = await db.query.apps.findFirst({
      where: eq(apps.id, id),
    })

    if (!targetApp) {
      return c.json({ message: "App not found" }, HttpStatusCodes.NOT_FOUND)
    }

    // 1. Find all matches referencing this app
    const appMatches = await db.query.matches.findMany({
      where: or(eq(matches.app1Id, id), eq(matches.app2Id, id)),
      columns: { id: true },
    })

    const matchIds = appMatches.map((m) => m.id)

    if (matchIds.length > 0) {
      await db.delete(proofs).where(inArray(proofs.matchId, matchIds))
      await db.delete(messages).where(inArray(messages.matchId, matchIds))
      await db.delete(matches).where(inArray(matches.id, matchIds))
    }

    // 2. Delete reports referencing this app
    await db.delete(reports).where(eq(reports.targetId, id))

    // 3. Delete the app
    await db.delete(apps).where(eq(apps.id, id))

    // 4. Decrement user's appsCount
    const owner = await db.query.users.findFirst({
      where: eq(users.id, targetApp.userId),
    })
    if (owner && owner.appsCount > 0) {
      await db
        .update(users)
        .set({ appsCount: Math.max(0, owner.appsCount - 1) })
        .where(eq(users.id, targetApp.userId))
    }

    // 5. Optionally ban the package
    if (banPackage === "true") {
      await db
        .insert(appBans)
        .values({
          packageName: targetApp.packageName.trim(),
          title: targetApp.title,
          playStoreUrl: targetApp.playStoreUrl,
          reason: reason || "Banned by Admin",
          bannedBy: adminUser.id,
        })
        .onConflictDoNothing()
    }

    // Invalidate public feed cache
    memoryCache.delete("apps_list:")

    return c.json(
      { message: `App "${targetApp.title}" (${targetApp.packageName}) has been deleted successfully.` },
      HttpStatusCodes.OK,
    )
  },
)

// 7c. Clean All Duplicate Apps (Keep Oldest Active App for Each Package Name)
router.openapi(
  createRoute({
    tags: ["Admin"],
    method: "post",
    path: "/api/admin/apps/clean-duplicates",
    summary: "Clean Duplicate Apps (Keep Oldest Per Package Name)",
    middleware: [adminAuthMiddleware] as const,
    responses: {
      [HttpStatusCodes.OK]: jsonContent(
        z.object({
          message: z.string(),
          deletedAppsCount: z.number(),
          cleanedPackages: z.array(z.string()),
        }),
        "Cleanup result",
      ),
    },
  }),
  async (c) => {
    // Fetch all active apps sorted by creation date ascending (oldest first)
    const allAppsList = await db.query.apps.findMany({
      where: not(eq(apps.status, "archived")),
      orderBy: [asc(apps.createdAt)],
    })

    const seenPackages = new Set<string>()
    const duplicateAppIds: string[] = []
    const cleanedPackages = new Set<string>()

    for (const appItem of allAppsList) {
      const pkg = appItem.packageName.toLowerCase().trim()
      if (seenPackages.has(pkg)) {
        duplicateAppIds.push(appItem.id)
        cleanedPackages.add(appItem.packageName)
      } else {
        seenPackages.add(pkg)
      }
    }

    if (duplicateAppIds.length === 0) {
      return c.json(
        {
          message: "No duplicate apps found in the system.",
          deletedAppsCount: 0,
          cleanedPackages: [],
        },
        HttpStatusCodes.OK,
      )
    }

    // Delete associated matches, proofs, and messages for duplicate apps
    const duplicateMatches = await db.query.matches.findMany({
      where: or(
        inArray(matches.app1Id, duplicateAppIds),
        inArray(matches.app2Id, duplicateAppIds),
      ),
      columns: { id: true },
    })

    const duplicateMatchIds = duplicateMatches.map((m) => m.id)
    if (duplicateMatchIds.length > 0) {
      await db.delete(proofs).where(inArray(proofs.matchId, duplicateMatchIds))
      await db.delete(messages).where(inArray(messages.matchId, duplicateMatchIds))
      await db.delete(matches).where(inArray(matches.id, duplicateMatchIds))
    }

    // Delete reports targeting duplicate apps
    await db.delete(reports).where(inArray(reports.targetId, duplicateAppIds))

    // Delete the duplicate apps
    await db.delete(apps).where(inArray(apps.id, duplicateAppIds))

    // Invalidate public feed cache
    memoryCache.delete("apps_list:")

    return c.json(
      {
        message: `Successfully cleaned ${duplicateAppIds.length} duplicate app(s).`,
        deletedAppsCount: duplicateAppIds.length,
        cleanedPackages: Array.from(cleanedPackages),
      },
      HttpStatusCodes.OK,
    )
  },
)

export default router
