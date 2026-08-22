import { createRoute, z } from "@hono/zod-openapi"
import { and, count, eq, not, sql } from "drizzle-orm"
import * as HttpStatusCodes from "stoker/http-status-codes"
import { jsonContent, jsonContentRequired } from "stoker/openapi/helpers"
import { createMessageObjectSchema } from "stoker/openapi/schemas"

import { db } from "../db"
import { apps, dailyActivity, users } from "../db/schema"
import { isUserAdmin } from "../lib/constants"
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
  googleGroupConfirmed: z.boolean().optional(),
  isAdmin: z.boolean(),
  streak: z.number(),
  bestStreak: z.number(),
  lastCheckInDate: z.string().nullable().optional(),
  unlockedAppSlots: z.number(),
  createdAt: z.string().or(z.date()),
  updatedAt: z.string().or(z.date()),
})

const SyncUserSchema = z.object({
  tokenIdentifier: z.string().min(1),
  name: z.string().default("Developer"),
  email: z.string().min(1),
  avatarUrl: z.string().nullable().optional(),
})

const UpdatePushTokenSchema = z.object({
  pushToken: z.string(),
})

const UpdateProfileSchema = z.object({
  name: z.string().min(1).optional(),
  avatarUrl: z.string().nullable().optional(),
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
    middleware: [authMiddleware] as const,
    request: {
      body: jsonContentRequired(SyncUserSchema, "User Sync Payload"),
    },
    responses: {
      [HttpStatusCodes.OK]: jsonContent(UserResponseSchema, "User profile"),
      [HttpStatusCodes.CREATED]: jsonContent(UserResponseSchema, "New user created"),
      [HttpStatusCodes.BAD_REQUEST]: jsonContent(
        createMessageObjectSchema("Invalid sync request"),
        "Invalid sync request",
      ),
    },
  }),
  async (c) => {
    const authUser = c.get("user")!
    const body = c.req.valid("json")
    const avatar =
      body.avatarUrl ||
      `https://ui-avatars.com/api/?name=${encodeURIComponent(body.name || authUser.name || "Developer")}&background=random`

    const existingUser = await db.query.users.findFirst({
      where: (u, { eq }) => eq(u.tokenIdentifier, authUser.tokenIdentifier!),
    })

    if (existingUser) {
      // Prevent hijacking if email is already taken by another account
      if (body.email && body.email.toLowerCase() !== existingUser.email.toLowerCase()) {
        const emailConflict = await db.query.users.findFirst({
          where: (u, { and, eq, not }) => and(eq(u.email, body.email.toLowerCase()), not(eq(u.id, existingUser.id))),
        })
        if (emailConflict) {
          return c.json(
            { message: "Email address is already registered to another user." },
            HttpStatusCodes.BAD_REQUEST,
          )
        }
      }

      const isUserAdminRole = isUserAdmin(body.email || existingUser.email, existingUser.isAdmin)

      const [updated] = await db
        .update(users)
        .set({
          name: body.name || existingUser.name,
          email: body.email ? body.email.toLowerCase() : existingUser.email,
          avatarUrl: avatar,
          isAdmin: isUserAdminRole,
          updatedAt: new Date(),
        })
        .where(eq(users.id, existingUser.id))
        .returning()

      const [activeApps] = await db
        .select({ count: count() })
        .from(apps)
        .where(and(eq(apps.userId, existingUser.id), not(eq(apps.status, "archived"))))

      return c.json({ ...updated, appsCount: activeApps?.count ?? 0 }, HttpStatusCodes.OK)
    }

    const isUserAdminRole = isUserAdmin(body.email || authUser.email, false)
    const [newUser] = await db
      .insert(users)
      .values({
        tokenIdentifier: authUser.tokenIdentifier,
        name: body.name || "Developer",
        email: body.email ? body.email.toLowerCase() : authUser.email,
        avatarUrl: avatar,
        isAdmin: isUserAdminRole,
        reputation: 100,
        appsCount: 0,
        isGroupMember: false,
        streak: 0,
        bestStreak: 0,
        unlockedAppSlots: 3,
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
      [HttpStatusCodes.NOT_FOUND]: jsonContent(createMessageObjectSchema("User not found"), "User not found"),
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

    const [activeAppsResult] = await db
      .select({ count: count() })
      .from(apps)
      .where(and(eq(apps.userId, user.id), not(eq(apps.status, "archived"))))

    return c.json(
      {
        ...user,
        appsCount: activeAppsResult?.count ?? 0,
        googleGroupConfirmed: user.isGroupMember,
      },
      HttpStatusCodes.OK,
    )
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
      [HttpStatusCodes.NOT_FOUND]: jsonContent(createMessageObjectSchema("User not found"), "User not found"),
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
      [HttpStatusCodes.OK]: jsonContent(createMessageObjectSchema("Push token updated"), "Push token updated"),
    },
  }),
  async (c) => {
    const userVar = c.get("user")!
    const body = c.req.valid("json")

    await db.update(users).set({ pushToken: body.pushToken, updatedAt: new Date() }).where(eq(users.id, userVar.id))

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
      [HttpStatusCodes.OK]: jsonContent(createMessageObjectSchema("Google Group confirmed"), "Google Group confirmed"),
    },
  }),
  async (c) => {
    const userVar = c.get("user")!

    await db.update(users).set({ isGroupMember: true, updatedAt: new Date() }).where(eq(users.id, userVar.id))

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

// 7. Unlock App Slots (Free 3 Slots Promotion)
router.openapi(
  createRoute({
    tags: ["Users"],
    method: "post",
    path: "/api/users/unlock-slots",
    summary: "Unlock All 3 App Slots Free",
    description: "Special event promo allowing users to unlock all 3 slots for free",
    middleware: [authMiddleware] as const,
    responses: {
      [HttpStatusCodes.OK]: jsonContent(UserResponseSchema, "Updated user profile with 3 slots"),
    },
  }),
  async (c) => {
    const userVar = c.get("user")!

    const [updated] = await db
      .update(users)
      .set({
        unlockedAppSlots: 3,
        updatedAt: new Date(),
      })
      .where(eq(users.id, userVar.id))
      .returning()

    return c.json(updated, HttpStatusCodes.OK)
  },
)

export default router
