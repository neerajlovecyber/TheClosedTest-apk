import { createRoute, z } from "@hono/zod-openapi"
import { and, desc, eq, or, sql } from "drizzle-orm"
import * as HttpStatusCodes from "stoker/http-status-codes"
import { jsonContent, jsonContentRequired } from "stoker/openapi/helpers"
import { createMessageObjectSchema } from "stoker/openapi/schemas"

import { db } from "../db"
import { apps, matches, messages, notifications, proofs, users } from "../db/schema"
import { memoryCache } from "../lib/cache"
import { createRouter } from "../lib/create-app"
import { authMiddleware } from "../middlewares/auth"
import { sendExpoPushNotification } from "../services/expo-push"
import { enrichAppsWithTesterCounts } from "./apps.route"

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
  app1: z.any().optional(),
  app2: z.any().optional(),
  user1: z.any().optional(),
  user2: z.any().optional(),
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
      [HttpStatusCodes.BAD_REQUEST]: jsonContent(createMessageObjectSchema("Validation Error"), "Validation error"),
    },
  }),
  async (c) => {
    const userVar = c.get("user")!
    const body = c.req.valid("json")
    let app1Id = body.myAppId || body.app1Id
    const targetAppId = body.targetAppId || body.app2Id

    if (!targetAppId) {
      return c.json({ message: "Target app ID is required" }, HttpStatusCodes.BAD_REQUEST)
    }

    if (!app1Id) {
      const userApp = await db.query.apps.findFirst({
        where: eq(apps.userId, userVar.id),
      })
      if (!userApp) {
        return c.json(
          { message: "You must add at least one app before requesting a swap" },
          HttpStatusCodes.BAD_REQUEST,
        )
      }
      app1Id = userApp.id
    }

    // Verify user owns app1
    const app1 = await db.query.apps.findFirst({
      where: (a, { eq }) => eq(a.id, app1Id),
    })

    if (!app1 || app1.userId !== userVar.id) {
      return c.json({ message: "You must own the source app" }, HttpStatusCodes.BAD_REQUEST)
    }

    // Verify target app exists
    const app2 = await db.query.apps.findFirst({
      where: (a, { eq }) => eq(a.id, targetAppId),
    })

    if (!app2) {
      return c.json({ message: "Target app not found" }, HttpStatusCodes.BAD_REQUEST)
    }

    if (app2.userId === userVar.id) {
      return c.json({ message: "Cannot match with your own app" }, HttpStatusCodes.BAD_REQUEST)
    }

    if (app1.status === "archived" || app2.status === "archived") {
      return c.json(
        { message: "Cannot request match: One of the apps has been archived or deleted" },
        HttpStatusCodes.BAD_REQUEST,
      )
    }

    const [enrichedApp1, enrichedApp2] = await enrichAppsWithTesterCounts([app1, app2])
    const count1 = (enrichedApp1 as any)?.currentTesters ?? 0
    const count2 = (enrichedApp2 as any)?.currentTesters ?? 0

    if (count1 >= app1.requiredTesters) {
      return c.json(
        {
          message: `Cannot request swap: Your app "${app1.title}" has reached full tester capacity (${count1}/${app1.requiredTesters})`,
        },
        HttpStatusCodes.BAD_REQUEST,
      )
    }

    if (count2 >= app2.requiredTesters) {
      return c.json(
        {
          message: `Cannot request swap: "${app2.title}" has reached full tester capacity (${count2}/${app2.requiredTesters})`,
        },
        HttpStatusCodes.BAD_REQUEST,
      )
    }

    // Check for duplicate pending/active match between these apps
    const existing = await db.query.matches.findFirst({
      where: (m, { and, or, eq }) =>
        and(
          or(
            and(eq(m.app1Id, app1Id), eq(m.app2Id, targetAppId)),
            and(eq(m.app1Id, targetAppId), eq(m.app2Id, app1Id)),
          ),
          or(eq(m.status, "pending"), eq(m.status, "active")),
        ),
    })

    if (existing) {
      return c.json(
        {
          message: "A match request or active test already exists between these apps",
        },
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

    // Fetch target user's push token to send push alert in background
    db.query.users
      .findFirst({
        where: (u, { eq }) => eq(u.id, app2.userId),
      })
      .then((targetUser) => {
        if (targetUser?.pushToken) {
          sendExpoPushNotification({
            to: targetUser.pushToken,
            title: "New Testing Request! 🚀",
            body: `${userVar.name || "A developer"} requested a peer test with ${app2.title}!`,
            data: { matchId: newMatch.id },
          }).catch(() => {})
        }
      })
      .catch((err) => {
        console.error("Match request push error:", err)
      })

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

    const conditions = [or(eq(matches.user1Id, userVar.id), eq(matches.user2Id, userVar.id))]

    if (status !== "all") {
      conditions.push(eq(matches.status, status))
    }

    const items = await db.query.matches.findMany({
      where: and(...conditions),
      with: {
        app1: true,
        app2: true,
        user1: true,
        user2: true,
        proofs: {
          orderBy: [desc(proofs.day), desc(proofs.submittedAt)],
        },
        messages: {
          orderBy: [desc(messages.sentAt)],
        },
      },
      orderBy: [desc(matches.lastActivity)],
    })

    const allApps = items.flatMap((m) => [m.app1, m.app2].filter(Boolean))
    const enrichedApps = await enrichAppsWithTesterCounts(allApps)
    const appMap = new Map(enrichedApps.map((a) => [a.id, a]))

    const enrichedItems = items.map((m) => {
      const matchProofs = m.proofs || []
      const user1LatestProof = matchProofs.find((p) => p.uploaderId === m.user1Id)
      const user2LatestProof = matchProofs.find((p) => p.uploaderId === m.user2Id)
      const latestMsg = m.messages?.[0]
      const isUser1 = m.user1Id === userVar.id || (userVar.tokenIdentifier && m.user1Id === userVar.tokenIdentifier)
      const myLastRead = isUser1 ? m.lastRead1 : m.lastRead2
      const isMsgFromMe =
        latestMsg &&
        (latestMsg.senderId === userVar.id ||
          (userVar.tokenIdentifier && latestMsg.senderId === userVar.tokenIdentifier) ||
          latestMsg.senderId === "me")

      const hasUnreadMessages = Boolean(
        latestMsg &&
        !isMsgFromMe &&
        (!myLastRead || new Date(latestMsg.sentAt).getTime() > new Date(myLastRead).getTime()),
      )

      return {
        ...m,
        app1: m.app1 ? appMap.get(m.app1.id) || m.app1 : null,
        app2: m.app2 ? appMap.get(m.app2.id) || m.app2 : null,
        hasUnreadMessages,
        latestMessage: latestMsg
          ? {
              content: latestMsg.content,
              sentAt: String(latestMsg.sentAt),
              senderId: latestMsg.senderId,
            }
          : null,
        user1LastProof: user1LatestProof
          ? {
              day: user1LatestProof.day,
              status: user1LatestProof.status,
              updatedAt: String(user1LatestProof.submittedAt),
            }
          : m.user1LastProof,
        user2LastProof: user2LatestProof
          ? {
              day: user2LatestProof.day,
              status: user2LatestProof.status,
              updatedAt: String(user2LatestProof.submittedAt),
            }
          : m.user2LastProof,
      }
    })

    return c.json(enrichedItems, HttpStatusCodes.OK)
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
        MatchSchema.extend({
          match: z.any().optional(),
          app1: z.any().optional(),
          app2: z.any().optional(),
          user1: z.any().optional(),
          user2: z.any().optional(),
        }),
        "Match details with app and user info",
      ),
      [HttpStatusCodes.NOT_FOUND]: jsonContent(createMessageObjectSchema("Match not found"), "Match not found"),
      [HttpStatusCodes.FORBIDDEN]: jsonContent(createMessageObjectSchema("Forbidden"), "Forbidden"),
    },
  }),
  async (c) => {
    const { id } = c.req.valid("param")
    const userVar = c.get("user")!

    const match = await db.query.matches.findFirst({
      where: (m, { eq }) => eq(m.id, id),
      with: {
        app1: true,
        app2: true,
        user1: true,
        user2: true,
        proofs: {
          orderBy: [desc(proofs.day), desc(proofs.submittedAt)],
        },
      },
    })

    if (!match) {
      return c.json({ message: "Match not found" }, HttpStatusCodes.NOT_FOUND)
    }

    if (match.user1Id !== userVar.id && match.user2Id !== userVar.id) {
      return c.json({ message: "Forbidden: Not part of this match" }, HttpStatusCodes.FORBIDDEN)
    }

    const matchProofs = match.proofs || []
    const user1LatestProof = matchProofs.find((p) => p.uploaderId === match.user1Id)
    const user2LatestProof = matchProofs.find((p) => p.uploaderId === match.user2Id)

    const [enrichedApp1, enrichedApp2] = await enrichAppsWithTesterCounts(
      [match.app1, match.app2].filter(Boolean) as any[],
    )
    const app1 = enrichedApp1 || match.app1
    const app2 = enrichedApp2 || match.app2

    const enrichedMatch = {
      ...match,
      app1,
      app2,
      user1LastProof: user1LatestProof
        ? {
            day: user1LatestProof.day,
            status: user1LatestProof.status,
            updatedAt: String(user1LatestProof.submittedAt),
          }
        : match.user1LastProof,
      user2LastProof: user2LatestProof
        ? {
            day: user2LatestProof.day,
            status: user2LatestProof.status,
            updatedAt: String(user2LatestProof.submittedAt),
          }
        : match.user2LastProof,
    }

    return c.json(
      {
        ...enrichedMatch,
        match: enrichedMatch,
        app1,
        app2,
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
      [HttpStatusCodes.FORBIDDEN]: jsonContent(createMessageObjectSchema("Cannot accept"), "Cannot accept"),
    },
  }),
  async (c) => {
    const { id } = c.req.valid("param")
    const userVar = c.get("user")!

    const match = await db.query.matches.findFirst({
      where: (m, { eq }) => eq(m.id, id),
    })

    if (!match || match.user2Id !== userVar.id || match.status !== "pending") {
      return c.json({ message: "Forbidden: Only target user can accept a pending match" }, HttpStatusCodes.FORBIDDEN)
    }

    const [app1, app2] = await Promise.all([
      db.query.apps.findFirst({ where: (a, { eq }) => eq(a.id, match.app1Id) }),
      db.query.apps.findFirst({ where: (a, { eq }) => eq(a.id, match.app2Id) }),
    ])

    if (!app1 || !app2) {
      return c.json({ message: "One of the matched apps was not found" }, HttpStatusCodes.FORBIDDEN)
    }

    if (app1.status === "archived" || app2.status === "archived") {
      return c.json(
        { message: "Cannot accept: One of the apps has been archived or deleted" },
        HttpStatusCodes.FORBIDDEN,
      )
    }

    const [enrichedApp1, enrichedApp2] = await enrichAppsWithTesterCounts([app1, app2])
    const count1 = (enrichedApp1 as any)?.currentTesters ?? 0
    const count2 = (enrichedApp2 as any)?.currentTesters ?? 0

    if (count1 >= app1.requiredTesters) {
      return c.json(
        {
          message: `Cannot accept: "${app1.title}" has reached full tester capacity (${count1}/${app1.requiredTesters})`,
        },
        HttpStatusCodes.FORBIDDEN,
      )
    }

    if (count2 >= app2.requiredTesters) {
      return c.json(
        {
          message: `Cannot accept: "${app2.title}" has reached full tester capacity (${count2}/${app2.requiredTesters})`,
        },
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

    // Invalidate public feed cache so marketplace immediately reflects new tester count
    memoryCache.delete("apps_list:")

    // Concurrently create notification and fire push alert in background
    Promise.all([
      db.insert(notifications).values({
        userId: match.user1Id,
        type: "acceptance",
        title: "Match Accepted! 🎉",
        body: "Your testing exchange was accepted! Day 1 testing starts today.",
        data: { matchId: match.id },
      }),
      db.query.users
        .findFirst({
          where: (u, { eq }) => eq(u.id, match.user1Id),
        })
        .then((requester) => {
          if (requester?.pushToken) {
            sendExpoPushNotification({
              to: requester.pushToken,
              title: "Match Accepted! 🎉",
              body: "Your peer testing partner accepted! Day 1 testing has started.",
              data: { matchId: match.id },
            }).catch(() => {})
          }
        }),
    ]).catch((err) => {
      console.error("Async accept side-effects error:", err)
    })

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
      [HttpStatusCodes.FORBIDDEN]: jsonContent(createMessageObjectSchema("Forbidden"), "Forbidden"),
    },
  }),
  async (c) => {
    const { id } = c.req.valid("param")
    const userVar = c.get("user")!

    const match = await db.query.matches.findFirst({
      where: (m, { eq }) => eq(m.id, id),
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

    // Invalidate public feed cache so marketplace immediately reflects new tester count
    memoryCache.delete("apps_list:")

    const partnerId = match.user1Id === userVar.id ? match.user2Id : match.user1Id
    Promise.all([
      db.insert(notifications).values({
        userId: partnerId,
        type: "match_cancelled",
        title: "Testing Ended",
        body: `${userVar.name || "Your partner"} has left or cancelled the testing match.`,
        data: { matchId: match.id },
      }),
      db.query.users
        .findFirst({
          where: (u, { eq }) => eq(u.id, partnerId),
        })
        .then((partnerUser) => {
          if (partnerUser?.pushToken) {
            sendExpoPushNotification({
              to: partnerUser.pushToken,
              title: "Testing Ended",
              body: `${userVar.name || "Your partner"} has left or cancelled the testing match.`,
              data: { matchId: match.id },
            }).catch(() => {})
          }
        }),
    ]).catch(() => {})

    return c.json(updated, HttpStatusCodes.OK)
  },
)

export default router
