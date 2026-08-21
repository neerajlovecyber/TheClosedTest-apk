import { createRoute, z } from "@hono/zod-openapi"
import { and, desc, eq, or, sql } from "drizzle-orm"
import * as HttpStatusCodes from "stoker/http-status-codes"
import { jsonContent, jsonContentRequired } from "stoker/openapi/helpers"
import { createMessageObjectSchema } from "stoker/openapi/schemas"

import { db } from "../db"
import { apps, matches, notifications, users } from "../db/schema"
import { createRouter } from "../lib/create-app"
import { authMiddleware } from "../middlewares/auth"
import { sendExpoPushNotification } from "../services/expo-push"

const MatchSchema = z.object({
  id: z.string(),
  user1Id: z.string(),
  app1Id: z.string(),
  user2Id: z.string(),
  app2Id: z.string(),
  status: z.enum(["pending", "active", "completed", "cancelled", "archived"]),
  startDate: z.string().or(z.date()).nullable().optional(),
  lastActivity: z.string().or(z.date()),
  lastRead1: z.string().or(z.date()).nullable().optional(),
  lastRead2: z.string().or(z.date()).nullable().optional(),
  completedAt: z.string().or(z.date()).nullable().optional(),
  user1ApprovedCount: z.number(),
  user2ApprovedCount: z.number(),
  user1LastProof: z.any().optional(),
  user2LastProof: z.any().optional(),
  createdAt: z.string().or(z.date()),
  updatedAt: z.string().or(z.date()),
})

const RequestMatchSchema = z.object({
  app1Id: z.string().optional(),
  myAppId: z.string().optional(),
  targetAppId: z.string().optional(),
  app2Id: z.string().optional(),
})

const router = createRouter()

// 1. Request a Match
router.openapi(
  createRoute({
    tags: ["Matches"],
    method: "post",
    path: "/api/matches/request",
    summary: "Request Peer-Testing Match",
    middleware: [authMiddleware] as const,
    request: {
      body: jsonContentRequired(RequestMatchSchema, "Match Request Payload"),
    },
    responses: {
      [HttpStatusCodes.CREATED]: jsonContent(MatchSchema, "Match requested"),
      [HttpStatusCodes.BAD_REQUEST]: jsonContent(
        createMessageObjectSchema("Validation Error"),
        "Validation error",
      ),
    },
  }),
  async (c) => {
    const userVar = c.get("user")!
    const body = c.req.valid("json")
    const app1Id = body.myAppId || body.app1Id
    const targetAppId = body.targetAppId || body.app2Id

    if (!app1Id || !targetAppId) {
      return c.json({ message: "Both myAppId and targetAppId are required" }, HttpStatusCodes.BAD_REQUEST)
    }

    // Verify user owns app1
    const app1 = await db.query.apps.findFirst({
      where: eq(apps.id, app1Id),
    })

    if (!app1 || app1.userId !== userVar.id) {
      return c.json({ message: "You must own the source app" }, HttpStatusCodes.BAD_REQUEST)
    }

    // Verify target app exists
    const app2 = await db.query.apps.findFirst({
      where: eq(apps.id, targetAppId),
    })

    if (!app2) {
      return c.json({ message: "Target app not found" }, HttpStatusCodes.BAD_REQUEST)
    }

    if (app2.userId === userVar.id) {
      return c.json({ message: "Cannot match with your own app" }, HttpStatusCodes.BAD_REQUEST)
    }

    // Check for duplicate pending/active match between these apps
    const existing = await db.query.matches.findFirst({
      where: and(
        or(
          and(eq(matches.app1Id, app1Id), eq(matches.app2Id, targetAppId)),
          and(eq(matches.app1Id, targetAppId), eq(matches.app2Id, app1Id)),
        ),
        or(eq(matches.status, "pending"), eq(matches.status, "active")),
      ),
    })

    if (existing) {
      return c.json(
        { message: "A match request or active test already exists between these apps" },
        HttpStatusCodes.BAD_REQUEST,
      )
    }

    const [newMatch] = await db
      .insert(matches)
      .values({
        user1Id: userVar.id,
        app1Id: app1.id,
        user2Id: app2.userId,
        app2Id: app2.id,
        status: "pending",
        user1ApprovedCount: 0,
        user2ApprovedCount: 0,
      })
      .returning()

    // Create notification for target user
    await db.insert(notifications).values({
      userId: app2.userId,
      type: "request",
      title: "New Testing Request!",
      body: `${userVar.name || "A developer"} wants to test ${app2.title} in exchange for ${app1.title}.`,
      data: { matchId: newMatch.id, app1Id: app1.id, app2Id: app2.id },
    })

    // Fetch target user's push token to send push alert
    const targetUser = await db.query.users.findFirst({
      where: eq(users.id, app2.userId),
    })

    if (targetUser?.pushToken) {
      await sendExpoPushNotification({
        to: targetUser.pushToken,
        title: "New Testing Request! 🚀",
        body: `${userVar.name || "A developer"} requested a peer test with ${app2.title}!`,
        data: { matchId: newMatch.id },
      })
    }

    return c.json(newMatch, HttpStatusCodes.CREATED)
  },
)

// 2. List Current User's Matches
router.openapi(
  createRoute({
    tags: ["Matches"],
    method: "get",
    path: "/api/matches",
    summary: "List My Matches",
    middleware: [authMiddleware] as const,
    request: {
      query: z.object({
        status: z.enum(["all", "pending", "active", "completed"]).default("all"),
      }),
    },
    responses: {
      [HttpStatusCodes.OK]: jsonContent(z.array(MatchSchema), "Matches list"),
    },
  }),
  async (c) => {
    const userVar = c.get("user")!
    const { status } = c.req.valid("query")

    const conditions = [
      or(eq(matches.user1Id, userVar.id), eq(matches.user2Id, userVar.id)),
    ]

    if (status !== "all") {
      conditions.push(eq(matches.status, status))
    }

    const items = await db.query.matches.findMany({
      where: and(...conditions),
      orderBy: [desc(matches.lastActivity)],
    })

    return c.json(items, HttpStatusCodes.OK)
  },
)

// 3. Get Match by ID
router.openapi(
  createRoute({
    tags: ["Matches"],
    method: "get",
    path: "/api/matches/:id",
    summary: "Get Match Details",
    middleware: [authMiddleware] as const,
    request: {
      params: z.object({ id: z.string() }),
    },
    responses: {
      [HttpStatusCodes.OK]: jsonContent(
        z.object({
          match: MatchSchema,
          app1: z.any(),
          app2: z.any(),
          user1: z.any(),
          user2: z.any(),
        }),
        "Match details with app and user info",
      ),
      [HttpStatusCodes.NOT_FOUND]: jsonContent(
        createMessageObjectSchema("Match not found"),
        "Match not found",
      ),
      [HttpStatusCodes.FORBIDDEN]: jsonContent(
        createMessageObjectSchema("Forbidden"),
        "Forbidden",
      ),
    },
  }),
  async (c) => {
    const { id } = c.req.valid("param")
    const userVar = c.get("user")!

    const match = await db.query.matches.findFirst({
      where: eq(matches.id, id),
      with: {
        app1: true,
        app2: true,
        user1: true,
        user2: true,
      },
    })

    if (!match) {
      return c.json({ message: "Match not found" }, HttpStatusCodes.NOT_FOUND)
    }

    if (match.user1Id !== userVar.id && match.user2Id !== userVar.id) {
      return c.json({ message: "Forbidden: Not part of this match" }, HttpStatusCodes.FORBIDDEN)
    }

    return c.json(
      {
        match,
        app1: match.app1,
        app2: match.app2,
        user1: match.user1,
        user2: match.user2,
      },
      HttpStatusCodes.OK,
    )
  },
)

// 4. Accept Match Request
router.openapi(
  createRoute({
    tags: ["Matches"],
    method: "post",
    path: "/api/matches/:id/accept",
    summary: "Accept Match Request",
    middleware: [authMiddleware] as const,
    request: {
      params: z.object({ id: z.string() }),
    },
    responses: {
      [HttpStatusCodes.OK]: jsonContent(MatchSchema, "Match accepted"),
      [HttpStatusCodes.FORBIDDEN]: jsonContent(
        createMessageObjectSchema("Cannot accept"),
        "Cannot accept",
      ),
    },
  }),
  async (c) => {
    const { id } = c.req.valid("param")
    const userVar = c.get("user")!

    const match = await db.query.matches.findFirst({
      where: eq(matches.id, id),
    })

    if (!match || match.user2Id !== userVar.id || match.status !== "pending") {
      return c.json(
        { message: "Forbidden: Only target user can accept a pending match" },
        HttpStatusCodes.FORBIDDEN,
      )
    }

    const now = new Date()
    const [updated] = await db
      .update(matches)
      .set({
        status: "active",
        startDate: now,
        lastActivity: now,
        updatedAt: now,
      })
      .where(eq(matches.id, id))
      .returning()

    // Increment currentTesters on both apps
    await db
      .update(apps)
      .set({ currentTesters: sql`${apps.currentTesters} + 1` })
      .where(or(eq(apps.id, match.app1Id), eq(apps.id, match.app2Id)))

    // Notify requester
    await db.insert(notifications).values({
      userId: match.user1Id,
      type: "acceptance",
      title: "Match Accepted! 🎉",
      body: "Your testing exchange was accepted! Day 1 testing starts today.",
      data: { matchId: match.id },
    })

    const requester = await db.query.users.findFirst({
      where: eq(users.id, match.user1Id),
    })

    if (requester?.pushToken) {
      await sendExpoPushNotification({
        to: requester.pushToken,
        title: "Match Accepted! 🎉",
        body: "Your peer testing partner accepted! Day 1 testing has started.",
        data: { matchId: match.id },
      })
    }

    return c.json(updated, HttpStatusCodes.OK)
  },
)

// 5. Reject / Cancel Match
router.openapi(
  createRoute({
    tags: ["Matches"],
    method: "post",
    path: "/api/matches/:id/reject",
    summary: "Reject / Cancel Match",
    middleware: [authMiddleware] as const,
    request: {
      params: z.object({ id: z.string() }),
    },
    responses: {
      [HttpStatusCodes.OK]: jsonContent(MatchSchema, "Match rejected or cancelled"),
      [HttpStatusCodes.FORBIDDEN]: jsonContent(
        createMessageObjectSchema("Forbidden"),
        "Forbidden",
      ),
    },
  }),
  async (c) => {
    const { id } = c.req.valid("param")
    const userVar = c.get("user")!

    const match = await db.query.matches.findFirst({
      where: eq(matches.id, id),
    })

    if (!match || (match.user1Id !== userVar.id && match.user2Id !== userVar.id)) {
      return c.json({ message: "Forbidden: Not part of match" }, HttpStatusCodes.FORBIDDEN)
    }

    const [updated] = await db
      .update(matches)
      .set({
        status: "cancelled",
        updatedAt: new Date(),
      })
      .where(eq(matches.id, id))
      .returning()

    return c.json(updated, HttpStatusCodes.OK)
  },
)

export default router
