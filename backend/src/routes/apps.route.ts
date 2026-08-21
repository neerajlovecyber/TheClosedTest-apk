import { createRoute, z } from "@hono/zod-openapi"
import { and, desc, eq, ilike, inArray, not, or, sql } from "drizzle-orm"
import * as HttpStatusCodes from "stoker/http-status-codes"
import { jsonContent, jsonContentRequired } from "stoker/openapi/helpers"
import { createMessageObjectSchema } from "stoker/openapi/schemas"

import { db } from "../db"
import { appBans, apps, matches, users } from "../db/schema"
import { memoryCache } from "../lib/cache"
import { createRouter } from "../lib/create-app"
import { authMiddleware } from "../middlewares/auth"

const AppSchema = z.object({
  id: z.string(),
  userId: z.string(),
  title: z.string(),
  packageName: z.string(),
  playStoreUrl: z.string(),
  iconUrl: z.string(),
  instructions: z.string(),
  requiredTesters: z.number(),
  currentTesters: z.number(),
  status: z.enum(["recruiting", "filled", "paused", "archived", "completed"]),
  completedAt: z.string().or(z.date()).nullable().optional(),
  flagCount: z.number(),
  visibilityStatus: z.enum(["unverified", "visible", "hidden"]).nullable().optional(),
  positiveVotes: z.number(),
  negativeVotes: z.number(),
  voters: z.array(z.string()),
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
})

type AppType = z.infer<typeof AppSchema>

const CreateAppSchema = z.object({
  title: z.string().min(2),
  packageName: z.string().min(3),
  playStoreUrl: z.string().url(),
  iconUrl: z.string().url(),
  instructions: z.string().min(10),
  requiredTesters: z.number().int().min(1).default(12),
})

const UpdateAppSchema = CreateAppSchema.partial().extend({
  status: z.enum(["recruiting", "filled", "paused", "archived", "completed"]).optional(),
})

const VoteSchema = z.object({
  type: z.enum(["positive", "negative"]),
})

async function enrichAppsWithTesterCounts<T extends { id: string }>(appItems: T[]): Promise<T[]> {
  if (appItems.length === 0) return []
  const appIds = appItems.map((a) => a.id)

  const activeMatches = await db.query.matches.findMany({
    where: and(
      or(
        inArray(matches.app1Id, appIds),
        inArray(matches.app2Id, appIds),
      ),
      eq(matches.status, "active"),
    ),
    columns: {
      app1Id: true,
      app2Id: true,
    },
  })

  const countMap = new Map<string, number>()
  for (const m of activeMatches) {
    if (m.app1Id && appIds.includes(m.app1Id)) {
      countMap.set(m.app1Id, (countMap.get(m.app1Id) || 0) + 1)
    }
    if (m.app2Id && appIds.includes(m.app2Id)) {
      countMap.set(m.app2Id, (countMap.get(m.app2Id) || 0) + 1)
    }
  }

  return appItems.map((item) => ({
    ...item,
    currentTesters: countMap.get(item.id) || 0,
  }))
}

async function enrichAppWithTesterCount<T extends { id: string }>(app: T): Promise<T> {
  const [enriched] = await enrichAppsWithTesterCounts([app])
  return enriched || app
}

const router = createRouter()

// 1. List Public Recruiting Apps (Cached for 5 seconds)
router.openapi(
  createRoute({
    tags: ["Apps"],
    method: "get",
    path: "/api/apps",
    summary: "List Recruiting Apps",
    request: {
      query: z.object({
        search: z.string().optional(),
        limit: z.coerce.number().default(20),
        offset: z.coerce.number().default(0),
      }),
    },
    responses: {
      [HttpStatusCodes.OK]: jsonContent(
        z.object({
          apps: z.array(AppSchema),
          total: z.number(),
        }),
        "Public recruiting apps feed",
      ),
    },
  }),
  async (c) => {
    const { search, limit, offset } = c.req.valid("query")
    const cacheKey = `apps_list:${search || ""}:${limit}:${offset}`

    const cached = memoryCache.get<{ apps: AppType[]; total: number }>(cacheKey)
    if (cached) {
      return c.json(cached, HttpStatusCodes.OK)
    }

    const conditions = [
      eq(apps.status, "recruiting"),
      or(eq(apps.visibilityStatus, "visible"), eq(apps.visibilityStatus, "unverified")),
    ]

    if (search) {
      conditions.push(
        or(
          ilike(apps.title, `%${search}%`),
          ilike(apps.packageName, `%${search}%`),
        )!,
      )
    }

    const rawItems = await db
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
      .where(and(...conditions))
      .orderBy(desc(apps.positiveVotes), desc(apps.createdAt))
      .limit(limit)
      .offset(offset)

    const items = rawItems.map((r) => ({
      ...r.app,
      user: r.user,
    }))

    const enrichedItems = await enrichAppsWithTesterCounts(items)

    const responseData = {
      apps: enrichedItems,
      total: enrichedItems.length,
    }

    memoryCache.set(cacheKey, responseData, 5)

    return c.json(responseData, HttpStatusCodes.OK)
  },
)

// 2. List Current User's Apps
router.openapi(
  createRoute({
    tags: ["Apps"],
    method: "get",
    path: "/api/apps/my",
    summary: "List My Submitted Apps",
    middleware: [authMiddleware] as const,
    responses: {
      [HttpStatusCodes.OK]: jsonContent(z.array(AppSchema), "My apps list"),
    },
  }),
  async (c) => {
    const userVar = c.get("user")!

    const items = await db.query.apps.findMany({
      where: and(eq(apps.userId, userVar.id), not(eq(apps.status, "archived"))),
      with: {
        user: true,
      },
      orderBy: [desc(apps.createdAt)],
    })

    const enrichedItems = await enrichAppsWithTesterCounts(items)

    return c.json(enrichedItems, HttpStatusCodes.OK)
  },
)

// 3. Create / Submit a New App
router.openapi(
  createRoute({
    tags: ["Apps"],
    method: "post",
    path: "/api/apps",
    summary: "Submit New App for 14-Day Testing",
    middleware: [authMiddleware] as const,
    request: {
      body: jsonContentRequired(CreateAppSchema, "App Creation Payload"),
    },
    responses: {
      [HttpStatusCodes.CREATED]: jsonContent(AppSchema, "App created"),
      [HttpStatusCodes.BAD_REQUEST]: jsonContent(
        createMessageObjectSchema("Limit reached or banned"),
        "Validation error",
      ),
    },
  }),
  async (c) => {
    const userVar = c.get("user")!
    const body = c.req.valid("json")

    // Check banned package names
    const isBanned = await db.query.appBans.findFirst({
      where: eq(appBans.packageName, body.packageName),
    })

    if (isBanned) {
      return c.json(
        { message: "This app package has been banned from testing." },
        HttpStatusCodes.BAD_REQUEST,
      )
    }

    // Check user active apps limit (unlockedAppSlots)
    const user = await db.query.users.findFirst({
      where: eq(users.id, userVar.id),
    })

    if (!user) {
      return c.json({ message: "User not found" }, HttpStatusCodes.BAD_REQUEST)
    }

    const currentActiveApps = await db.query.apps.findMany({
      where: and(eq(apps.userId, user.id), not(eq(apps.status, "archived"))),
    })

    if (currentActiveApps.length >= user.unlockedAppSlots) {
      return c.json(
        {
          message: `You have reached your maximum active app limit (${user.unlockedAppSlots}). Test other apps or maintain your streak to unlock more slots!`,
        },
        HttpStatusCodes.BAD_REQUEST,
      )
    }

    const [newApp] = await db
      .insert(apps)
      .values({
        userId: user.id,
        title: body.title,
        packageName: body.packageName,
        playStoreUrl: body.playStoreUrl,
        iconUrl: body.iconUrl,
        instructions: body.instructions,
        requiredTesters: body.requiredTesters,
        currentTesters: 0,
        status: "recruiting",
        visibilityStatus: "unverified",
      })
      .returning()

    // Increment user's appsCount
    await db
      .update(users)
      .set({ appsCount: user.appsCount + 1 })
      .where(eq(users.id, user.id))

    // Invalidate public feed cache
    memoryCache.delete("apps_list:")

    return c.json(newApp, HttpStatusCodes.CREATED)
  },
)

// 4. Get App by ID
router.openapi(
  createRoute({
    tags: ["Apps"],
    method: "get",
    path: "/api/apps/:id",
    summary: "Get App Details",
    request: {
      params: z.object({ id: z.string() }),
    },
    responses: {
      [HttpStatusCodes.OK]: jsonContent(AppSchema, "App details"),
      [HttpStatusCodes.NOT_FOUND]: jsonContent(
        createMessageObjectSchema("App not found"),
        "App not found",
      ),
    },
  }),
  async (c) => {
    const { id } = c.req.valid("param")
    const app = await db.query.apps.findFirst({
      where: eq(apps.id, id),
      with: {
        user: true,
      },
    })

    if (!app) {
      return c.json({ message: "App not found" }, HttpStatusCodes.NOT_FOUND)
    }

    const enrichedApp = await enrichAppWithTesterCount(app)

    return c.json(enrichedApp, HttpStatusCodes.OK)
  },
)

// 5. Update App
router.openapi(
  createRoute({
    tags: ["Apps"],
    method: "patch",
    path: "/api/apps/:id",
    summary: "Update App Details",
    middleware: [authMiddleware] as const,
    request: {
      params: z.object({ id: z.string() }),
      body: jsonContentRequired(UpdateAppSchema, "App Update Payload"),
    },
    responses: {
      [HttpStatusCodes.OK]: jsonContent(AppSchema, "Updated app"),
      [HttpStatusCodes.FORBIDDEN]: jsonContent(
        createMessageObjectSchema("Not owner"),
        "Not owner",
      ),
    },
  }),
  async (c) => {
    const { id } = c.req.valid("param")
    const userVar = c.get("user")!
    const body = c.req.valid("json")

    const existing = await db.query.apps.findFirst({
      where: eq(apps.id, id),
    })

    if (!existing || existing.userId !== userVar.id) {
      return c.json({ message: "Forbidden: Not owner of this app" }, HttpStatusCodes.FORBIDDEN)
    }

    const [updated] = await db
      .update(apps)
      .set({
        ...body,
        updatedAt: new Date(),
      })
      .where(eq(apps.id, id))
      .returning()

    // If app status changed to completed, reward +20 reputation to the owner
    if (body.status === "completed" && existing.status !== "completed") {
      await db
        .update(users)
        .set({ reputation: sql`${users.reputation} + 20` })
        .where(eq(users.id, userVar.id))
    }

    // Invalidate public feed cache
    memoryCache.delete("apps_list:")

    return c.json(updated, HttpStatusCodes.OK)
  },
)

// 6. Vote / Boost App
router.openapi(
  createRoute({
    tags: ["Apps"],
    method: "post",
    path: "/api/apps/:id/vote",
    summary: "Vote on App Visibility",
    middleware: [authMiddleware] as const,
    request: {
      params: z.object({ id: z.string() }),
      body: jsonContentRequired(VoteSchema, "Vote Payload"),
    },
    responses: {
      [HttpStatusCodes.OK]: jsonContent(
        createMessageObjectSchema("Vote recorded"),
        "Vote recorded",
      ),
      [HttpStatusCodes.BAD_REQUEST]: jsonContent(
        createMessageObjectSchema("Already voted"),
        "Already voted",
      ),
      [HttpStatusCodes.NOT_FOUND]: jsonContent(
        createMessageObjectSchema("App not found"),
        "App not found",
      ),
    },
  }),
  async (c) => {
    const { id } = c.req.valid("param")
    const userVar = c.get("user")!
    const { type } = c.req.valid("json")

    const app = await db.query.apps.findFirst({
      where: eq(apps.id, id),
    })

    if (!app) {
      return c.json({ message: "App not found" }, HttpStatusCodes.NOT_FOUND)
    }

    if (app.voters.includes(userVar.id)) {
      return c.json(
        { message: "You have already voted on this app" },
        HttpStatusCodes.BAD_REQUEST,
      )
    }

    const positiveVotes = type === "positive" ? app.positiveVotes + 1 : app.positiveVotes
    const negativeVotes = type === "negative" ? app.negativeVotes + 1 : app.negativeVotes
    const updatedVoters = [...app.voters, userVar.id]

    let visibilityStatus = app.visibilityStatus
    if (positiveVotes >= 3 && positiveVotes > negativeVotes) {
      visibilityStatus = "visible"
    } else if (negativeVotes >= 3 && negativeVotes > positiveVotes) {
      visibilityStatus = "hidden"
    }

    await db
      .update(apps)
      .set({
        positiveVotes,
        negativeVotes,
        visibilityStatus,
        voters: updatedVoters,
        updatedAt: new Date(),
      })
      .where(eq(apps.id, id))

    // Invalidate public feed cache
    memoryCache.delete("apps_list:")

    return c.json({ message: "Vote recorded successfully" }, HttpStatusCodes.OK)
  },
)

export default router
