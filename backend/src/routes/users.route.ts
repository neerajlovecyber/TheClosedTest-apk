import { createRoute, z } from "@hono/zod-openapi"
import { eq, sql } from "drizzle-orm"
import * as HttpStatusCodes from "stoker/http-status-codes"
import { jsonContent, jsonContentRequired } from "stoker/openapi/helpers"
import { createMessageObjectSchema } from "stoker/openapi/schemas"

import { db } from "../db"
import { dailyActivity, users } from "../db/schema"
import { createRouter } from "../lib/create-app"
import { authMiddleware } from "../middlewares/auth"

const UserResponseSchema = z.object({
  id: z.string(),
  tokenIdentifier: z.string().nullable().optional(),
  name: z.string(),
  email: z.string(),
  avatarUrl: z.string().nullable().optional(),
  reputation: z.number(),
  appsCount: z.number(),
  pushToken: z.string().nullable().optional(),
  isGroupMember: z.boolean(),
  isAdmin: z.boolean(),
  streak: z.number(),
  bestStreak: z.number(),
  lastCheckInDate: z.string().nullable().optional(),
  unlockedAppSlots: z.number(),
  showDeletionPopup: z.boolean(),
  createdAt: z.string().or(z.date()),
  updatedAt: z.string().or(z.date()),
})

const SyncUserSchema = z.object({
  tokenIdentifier: z.string(),
  name: z.string(),
  email: z.string().email(),
  avatarUrl: z.string().optional(),
})

const UpdatePushTokenSchema = z.object({
  pushToken: z.string(),
})

const UpdateProfileSchema = z.object({
  name: z.string().min(1).optional(),
  avatarUrl: z.string().url().optional(),
})

const router = createRouter()

// 1. Sync / Store User on Auth
router.openapi(
  createRoute({
    tags: ["Users"],
    method: "post",
    path: "/api/users/sync",
    summary: "Sync User Identity",
    description: "Upserts user after Clerk/BetterAuth login",
    request: {
      body: jsonContentRequired(SyncUserSchema, "User Sync Payload"),
    },
    responses: {
      [HttpStatusCodes.OK]: jsonContent(UserResponseSchema, "User profile"),
      [HttpStatusCodes.CREATED]: jsonContent(UserResponseSchema, "New user created"),
    },
  }),
  async (c) => {
    const body = c.req.valid("json")
    const avatar =
      body.avatarUrl ||
      `https://ui-avatars.com/api/?name=${encodeURIComponent(body.name)}&background=random`

    const existingUser = await db.query.users.findFirst({
      where: (u, { or, eq }) =>
        or(eq(u.tokenIdentifier, body.tokenIdentifier), eq(u.email, body.email)),
    })

    if (existingUser) {
      const [updated] = await db
        .update(users)
        .set({
          name: body.name,
          email: body.email,
          tokenIdentifier: body.tokenIdentifier,
          avatarUrl: avatar,
          updatedAt: new Date(),
        })
        .where(eq(users.id, existingUser.id))
        .returning()

      return c.json(updated, HttpStatusCodes.OK)
    }

    const [newUser] = await db
      .insert(users)
      .values({
        tokenIdentifier: body.tokenIdentifier,
        name: body.name,
        email: body.email,
        avatarUrl: avatar,
        reputation: 100,
        appsCount: 0,
        isGroupMember: false,
        streak: 0,
        bestStreak: 0,
      })
      .returning()

    return c.json(newUser, HttpStatusCodes.CREATED)
  },
)

// 2. Get Current User Profile (Protected)
router.openapi(
  createRoute({
    tags: ["Users"],
    method: "get",
    path: "/api/users/me",
    summary: "Get Current User Profile",
    middleware: [authMiddleware] as const,
    responses: {
      [HttpStatusCodes.OK]: jsonContent(UserResponseSchema, "Current user details"),
      [HttpStatusCodes.NOT_FOUND]: jsonContent(
        createMessageObjectSchema("User not found"),
        "User not found",
      ),
    },
  }),
  async (c) => {
    const userVar = c.get("user")!
    const user = await db.query.users.findFirst({
      where: eq(users.id, userVar.id),
    })

    if (!user) {
      return c.json({ message: "User not found" }, HttpStatusCodes.NOT_FOUND)
    }

    return c.json(user, HttpStatusCodes.OK)
  },
)

// 3. Daily Streak Check-In
router.openapi(
  createRoute({
    tags: ["Users"],
    method: "post",
    path: "/api/users/checkin",
    summary: "Daily Check-in & Streak Increment",
    middleware: [authMiddleware] as const,
    responses: {
      [HttpStatusCodes.OK]: jsonContent(
        z.object({
          streak: z.number(),
          bestStreak: z.number(),
          alreadyCheckedIn: z.boolean(),
          message: z.string(),
        }),
        "Check-in result",
      ),
      [HttpStatusCodes.NOT_FOUND]: jsonContent(
        createMessageObjectSchema("User not found"),
        "User not found",
      ),
    },
  }),
  async (c) => {
    const userVar = c.get("user")!
    const user = await db.query.users.findFirst({
      where: eq(users.id, userVar.id),
    })

    if (!user) {
      return c.json({ message: "User not found" }, HttpStatusCodes.NOT_FOUND)
    }

    const today = new Date().toISOString().split("T")[0]

    // Log daily activity if not already logged today
    const existingLog = await db.query.dailyActivity.findFirst({
      where: (da, { and, eq }) => and(eq(da.userId, user.id), eq(da.date, today)),
    })

    if (!existingLog) {
      await db.insert(dailyActivity).values({
        userId: user.id,
        date: today,
      })
    }

    if (user.lastCheckInDate === today) {
      return c.json(
        {
          streak: user.streak,
          bestStreak: user.bestStreak,
          alreadyCheckedIn: true,
          message: "Already checked in today!",
        },
        HttpStatusCodes.OK,
      )
    }

    // Check if yesterday was the last check-in to preserve streak
    const yesterday = new Date(Date.now() - 86400000).toISOString().split("T")[0]
    let newStreak = user.streak

    if (user.lastCheckInDate === yesterday) {
      newStreak += 1
    } else {
      newStreak = 1
    }

    const bestStreak = Math.max(user.bestStreak, newStreak)

    await db
      .update(users)
      .set({
        streak: newStreak,
        bestStreak,
        lastCheckInDate: today,
        updatedAt: new Date(),
      })
      .where(eq(users.id, user.id))

    return c.json(
      {
        streak: newStreak,
        bestStreak,
        alreadyCheckedIn: false,
        message: "Check-in successful! Streak updated.",
      },
      HttpStatusCodes.OK,
    )
  },
)

// 4. Update Push Token
router.openapi(
  createRoute({
    tags: ["Users"],
    method: "patch",
    path: "/api/users/push-token",
    summary: "Register Expo Push Token",
    middleware: [authMiddleware] as const,
    request: {
      body: jsonContentRequired(UpdatePushTokenSchema, "Push token payload"),
    },
    responses: {
      [HttpStatusCodes.OK]: jsonContent(
        createMessageObjectSchema("Push token updated"),
        "Push token updated",
      ),
    },
  }),
  async (c) => {
    const userVar = c.get("user")!
    const body = c.req.valid("json")

    await db
      .update(users)
      .set({ pushToken: body.pushToken, updatedAt: new Date() })
      .where(eq(users.id, userVar.id))

    return c.json({ message: "Push token updated successfully" }, HttpStatusCodes.OK)
  },
)

// 5. Confirm Google Group Membership
router.openapi(
  createRoute({
    tags: ["Users"],
    method: "patch",
    path: "/api/users/group-confirm",
    summary: "Confirm Google Group Membership",
    middleware: [authMiddleware] as const,
    responses: {
      [HttpStatusCodes.OK]: jsonContent(
        createMessageObjectSchema("Google Group confirmed"),
        "Google Group confirmed",
      ),
    },
  }),
  async (c) => {
    const userVar = c.get("user")!

    await db
      .update(users)
      .set({ isGroupMember: true, updatedAt: new Date() })
      .where(eq(users.id, userVar.id))

    return c.json({ message: "Google Group membership confirmed" }, HttpStatusCodes.OK)
  },
)

// 6. Update Profile
router.openapi(
  createRoute({
    tags: ["Users"],
    method: "patch",
    path: "/api/users/profile",
    summary: "Update Profile",
    middleware: [authMiddleware] as const,
    request: {
      body: jsonContentRequired(UpdateProfileSchema, "Profile payload"),
    },
    responses: {
      [HttpStatusCodes.OK]: jsonContent(UserResponseSchema, "Updated user profile"),
    },
  }),
  async (c) => {
    const userVar = c.get("user")!
    const body = c.req.valid("json")

    const [updated] = await db
      .update(users)
      .set({
        ...(body.name ? { name: body.name } : {}),
        ...(body.avatarUrl ? { avatarUrl: body.avatarUrl } : {}),
        updatedAt: new Date(),
      })
      .where(eq(users.id, userVar.id))
      .returning()

    return c.json(updated, HttpStatusCodes.OK)
  },
)

export default router
