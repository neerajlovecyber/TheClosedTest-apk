import { createRoute, z } from "@hono/zod-openapi"
import * as HttpStatusCodes from "stoker/http-status-codes"
import { jsonContent, jsonContentRequired } from "stoker/openapi/helpers"
import { createMessageObjectSchema } from "stoker/openapi/schemas"

import { UsersController } from "../controllers/users.controller"
import { createRouter } from "../lib/create-app"
import { authMiddleware } from "../middlewares/auth"

export const UserResponseSchema = z.object({
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
  UsersController.sync,
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
  UsersController.me,
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
  UsersController.checkin,
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
  UsersController.updatePushToken,
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
  UsersController.confirmGoogleGroup,
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
  UsersController.updateProfile,
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
  UsersController.unlockSlots,
)

// 8. Get Active Online Users Count (Zero DB Load)
router.openapi(
  createRoute({
    tags: ["Users"],
    method: "get",
    path: "/api/users/active-count",
    summary: "Get Currently Active Users Count",
    description: "Returns count of users active in the last 5, 15, and 60 minutes with zero database load",
    responses: {
      [HttpStatusCodes.OK]: jsonContent(
        z.object({
          active5m: z.number(),
          active15m: z.number(),
          active1h: z.number(),
        }),
        "Active user counts",
      ),
    },
  }),
  UsersController.activeCount,
)

export default router
