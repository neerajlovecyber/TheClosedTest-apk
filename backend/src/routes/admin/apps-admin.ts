import { createRoute, z } from "@hono/zod-openapi"
import { and, asc, desc, eq, ilike, inArray, not, or } from "drizzle-orm"
import * as HttpStatusCodes from "stoker/http-status-codes"
import { jsonContent } from "stoker/openapi/helpers"
import { createMessageObjectSchema } from "stoker/openapi/schemas"

import { db } from "../../db"
import { appBans, apps, matches, messages, proofs, reports, users } from "../../db/schema"
import { memoryCache } from "../../lib/cache"
import { createRouter } from "../../lib/create-app"
import { adminAuthMiddleware } from "../../middlewares/auth"
import { enrichAppsWithTesterCounts } from "../apps.route"
import { AdminAppItemSchema } from "./schemas"

const router = createRouter()

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
        or(ilike(apps.title, term), ilike(apps.packageName, term), ilike(users.name, term), ilike(users.email, term))!,
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

    const formatted = rawApps.map((r) => ({
      ...r.app,
      user: r.user,
    }))

    const enriched = await enrichAppsWithTesterCounts(formatted)

    const finalApps = enriched.map((item) => {
      const isDup = (packageCountMap.get(item.packageName.toLowerCase().trim()) || 0) > 1
      return {
        ...item,
        isDuplicate: isDup,
      }
    })

    // Filter by status if provided (checking real filled vs recruiting status)
    let resultApps = finalApps
    if (status && status !== "all") {
      if (status === "filled") {
        resultApps = finalApps.filter((a) => a.status === "filled" || a.currentTesters >= a.requiredTesters)
      } else if (status === "recruiting") {
        resultApps = finalApps.filter((a) => a.status === "recruiting" && a.currentTesters < a.requiredTesters)
      } else {
        resultApps = finalApps.filter((a) => a.status === status)
      }
    }

    return c.json(
      {
        apps: resultApps,
        total: resultApps.length,
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
      [HttpStatusCodes.OK]: jsonContent(createMessageObjectSchema("App deleted"), "Deletion result"),
      [HttpStatusCodes.NOT_FOUND]: jsonContent(createMessageObjectSchema("App not found"), "App not found"),
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
      {
        message: `App "${targetApp.title}" (${targetApp.packageName}) has been deleted successfully.`,
      },
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
      where: or(inArray(matches.app1Id, duplicateAppIds), inArray(matches.app2Id, duplicateAppIds)),
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
