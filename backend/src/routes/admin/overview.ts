import { createRoute, z } from "@hono/zod-openapi"
import { and, count, desc, eq, ilike, not, or, sql } from "drizzle-orm"
import * as HttpStatusCodes from "stoker/http-status-codes"
import { jsonContent } from "stoker/openapi/helpers"
import { createMessageObjectSchema } from "stoker/openapi/schemas"

import { db } from "../../db"
import { apps, matches, proofs, reports, users } from "../../db/schema"
import { createRouter } from "../../lib/create-app"
import { presence } from "../../lib/presence"
import { adminAuthMiddleware } from "../../middlewares/auth"
import { enrichAppsWithTesterCounts } from "../apps.route"
import { AdminUserListItemSchema } from "./schemas"

const router = createRouter()

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
          activeUsers: z.number(),
          activeUsers24h: z.number(),
          weeklyActiveUsers: z
            .array(
              z.object({
                date: z.string(),
                count: z.number(),
              }),
            )
            .optional(),
        }),
        "Platform stats",
      ),
    },
  }),
  async (c) => {
    const [userCount] = await db.select({ value: count() }).from(users)
    const [appCount] = await db.select({ value: count() }).from(apps)
    const [matchCount] = await db.select({ value: count() }).from(matches).where(eq(matches.status, "active"))
    const [proofCount] = await db.select({ value: count() }).from(proofs)
    const [reportCount] = await db.select({ value: count() }).from(reports).where(eq(reports.status, "pending"))

    const weeklyResult = await db.execute<{ day: string; active_users: number }>(sql`
      SELECT d::date::text as day, COUNT(DISTINCT a.user_id)::int as active_users
      FROM generate_series(CURRENT_DATE - INTERVAL '6 days', CURRENT_DATE, '1 day'::interval) d
      LEFT JOIN (
        SELECT user1_id as user_id, last_activity::date as act_date FROM matches
        UNION
        SELECT user2_id as user_id, last_activity::date as act_date FROM matches
        UNION
        SELECT uploader_id as user_id, submitted_at::date as act_date FROM proofs
        UNION
        SELECT sender_id as user_id, sent_at::date as act_date FROM messages
        UNION
        SELECT id as user_id, TO_DATE(last_check_in_date, 'YYYY-MM-DD') as act_date FROM users WHERE last_check_in_date IS NOT NULL
      ) a ON a.act_date = d::date
      GROUP BY d::date
      ORDER BY d::date ASC;
    `)

    const weeklyRows: any[] = (weeklyResult as any)?.rows ?? (weeklyResult as any) ?? []
    const weeklyActiveUsers = weeklyRows.map((r: any) => ({
      date: String(r.day),
      count: Number(r.active_users || 0),
    }))

    const online5m = presence.getActiveCount(5)
    const activeUsers24h = Math.max(
      weeklyActiveUsers[weeklyActiveUsers.length - 1]?.count ?? 0,
      presence.getActiveCount(1440),
      online5m,
    )

    return c.json(
      {
        totalUsers: Number(userCount.value),
        totalApps: Number(appCount.value),
        activeMatches: Number(matchCount.value),
        totalProofs: Number(proofCount.value),
        pendingReports: Number(reportCount.value),
        activeUsers: online5m,
        activeUsers24h,
        weeklyActiveUsers,
      },
      HttpStatusCodes.OK,
    )
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
      [HttpStatusCodes.OK]: jsonContent(z.array(AdminUserListItemSchema), "List of platform users"),
    },
  }),
  async (c) => {
    const { search, limit = 50 } = c.req.valid("query")

    let condition = undefined
    if (search && search.trim()) {
      const term = `%${search.trim()}%`
      condition = or(ilike(users.name, term), ilike(users.email, term), ilike(users.tokenIdentifier, term))
    }

    const userList = await db.query.users.findMany({
      where: condition,
      orderBy: [desc(users.createdAt)],
      limit: Math.min(limit, 100),
    })

    return c.json(userList, HttpStatusCodes.OK)
  },
)

// 5e. Get Full User Context & Apps (Admin)
router.openapi(
  createRoute({
    tags: ["Admin"],
    method: "get",
    path: "/api/admin/users/:userId/details",
    summary: "Get User Context and Registered Apps for Admin Inspection",
    middleware: [adminAuthMiddleware] as const,
    request: {
      params: z.object({ userId: z.string() }),
    },
    responses: {
      [HttpStatusCodes.OK]: jsonContent(
        z.object({
          user: z.object({
            id: z.string(),
            name: z.string().nullable().optional(),
            email: z.string().nullable().optional(),
            avatarUrl: z.string().nullable().optional(),
            reputation: z.number(),
            streak: z.number(),
            isGroupMember: z.boolean(),
            createdAt: z.string().or(z.date()),
          }),
          apps: z.array(
            z.object({
              id: z.string(),
              title: z.string(),
              packageName: z.string(),
              iconUrl: z.string(),
              playStoreUrl: z.string(),
              status: z.string(),
              requiredTesters: z.number(),
              currentTesters: z.number(),
              instructions: z.string(),
              createdAt: z.string().or(z.date()),
            }),
          ),
          activeMatchesCount: z.number(),
        }),
        "User context details",
      ),
      [HttpStatusCodes.NOT_FOUND]: jsonContent(createMessageObjectSchema("User not found"), "User not found"),
    },
  }),
  async (c) => {
    const { userId: targetUserId } = c.req.valid("param")

    const targetUser = await db.query.users.findFirst({
      where: (u, { or, eq }) => or(eq(u.id, targetUserId), eq(u.tokenIdentifier, targetUserId)),
    })

    if (!targetUser) {
      return c.json({ message: "User not found" }, HttpStatusCodes.NOT_FOUND)
    }

    const userApps = await db.query.apps.findMany({
      where: and(eq(apps.userId, targetUser.id), not(eq(apps.status, "archived"))),
      orderBy: [desc(apps.createdAt)],
    })

    const enrichedUserApps = await enrichAppsWithTesterCounts(userApps)

    const [activeMatchesResult] = await db
      .select({ count: count() })
      .from(matches)
      .where(
        and(eq(matches.status, "active"), or(eq(matches.user1Id, targetUser.id), eq(matches.user2Id, targetUser.id))),
      )

    return c.json(
      {
        user: {
          id: targetUser.id,
          name: targetUser.name,
          email: targetUser.email,
          avatarUrl: targetUser.avatarUrl,
          reputation: targetUser.reputation,
          streak: targetUser.streak,
          isGroupMember: targetUser.isGroupMember,
          createdAt: targetUser.createdAt,
        },
        apps: enrichedUserApps.map((a: any) => ({
          id: a.id,
          title: a.title,
          packageName: a.packageName,
          iconUrl: a.iconUrl,
          playStoreUrl: a.playStoreUrl,
          status: a.status,
          requiredTesters: a.requiredTesters,
          currentTesters: a.currentTesters,
          instructions: a.instructions,
          createdAt: a.createdAt,
        })),
        activeMatchesCount: activeMatchesResult?.count ?? 0,
      },
      HttpStatusCodes.OK,
    )
  },
)

export default router
