import { createRoute, z } from "@hono/zod-openapi"
import { and, count, desc, eq } from "drizzle-orm"
import * as HttpStatusCodes from "stoker/http-status-codes"
import { jsonContent, jsonContentRequired } from "stoker/openapi/helpers"
import { createMessageObjectSchema } from "stoker/openapi/schemas"

import { db } from "../db"
import {
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

export default router
