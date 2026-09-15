import { createRoute, z } from "@hono/zod-openapi"
import { and, desc, eq, or } from "drizzle-orm"
import * as HttpStatusCodes from "stoker/http-status-codes"
import { jsonContent, jsonContentRequired } from "stoker/openapi/helpers"
import { createMessageObjectSchema } from "stoker/openapi/schemas"

import { db } from "../../db"
import {
  adminChats,
  adminMessages,
  appBans,
  apps,
  matches,
  messages,
  proofs,
  reports,
  userBans,
  users,
  userWarnings,
} from "../../db/schema"
import { createRouter } from "../../lib/create-app"
import { memoryCache } from "../../lib/cache"
import { adminAuthMiddleware, authMiddleware } from "../../middlewares/auth"
import { BanAppSchema, BanUserSchema, CreateReportSchema, ReportSchema } from "./schemas"

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
        description: body.description?.trim() || `Reported as ${body.type.replace(/_/g, " ")}`,
        screenshots: body.screenshots,
        status: "pending",
      })
      .returning()

    // Automated action: If an app is reported, increment its flagCount.
    // If it reaches 3 or more reports, automatically hide the app from Marketplace.
    const targetAppId =
      body.reportedAppId || (["app_not_visible", "app_spam"].includes(body.type) ? body.targetId : undefined)

    if (targetAppId) {
      const targetApp = await db.query.apps.findFirst({
        where: eq(apps.id, targetAppId),
      })
      if (targetApp) {
        const newFlagCount = (targetApp.flagCount || 0) + 1
        const shouldHide = newFlagCount >= 3
        const newVisibility = shouldHide ? "hidden" : targetApp.visibilityStatus
        const newStatus = shouldHide ? "paused" : targetApp.status

        await db
          .update(apps)
          .set({
            flagCount: newFlagCount,
            visibilityStatus: newVisibility,
            status: newStatus,
            updatedAt: new Date(),
          })
          .where(eq(apps.id, targetApp.id))

        memoryCache.delete("apps_list:")
      }
    }

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
      [HttpStatusCodes.OK]: jsonContent(createMessageObjectSchema("User banned"), "User banned successfully"),
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
      [HttpStatusCodes.OK]: jsonContent(createMessageObjectSchema("App package banned"), "App banned successfully"),
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

export default router
