import { createRoute, z } from "@hono/zod-openapi"
import * as HttpStatusCodes from "stoker/http-status-codes"
import { jsonContent, jsonContentRequired } from "stoker/openapi/helpers"
import { createMessageObjectSchema } from "stoker/openapi/schemas"

import { AppsController } from "../controllers/apps.controller"
import { createRouter } from "../lib/create-app"
import { authMiddleware } from "../middlewares/auth"
import { enrichAppsWithTesterCounts } from "../services/app.service"

export { enrichAppsWithTesterCounts }

export const AppSchema = z.object({
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

const CreateAppSchema = z.object({
  title: z.string().min(2),
  packageName: z.string().min(3),
  playStoreUrl: z.string().url(),
  iconUrl: z.string().url(),
  instructions: z.string().min(10),
  requiredTesters: z.number().int().min(1).max(12).default(12),
})

const UpdateAppSchema = CreateAppSchema.partial().extend({
  status: z.enum(["recruiting", "paused", "archived", "completed"]).optional(),
})

const VoteSchema = z.object({
  type: z.enum(["positive", "negative"]),
})

const router = createRouter()

// 1. List Public Recruiting Apps
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
  AppsController.listPublic,
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
  AppsController.listMine,
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
  AppsController.create,
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
      [HttpStatusCodes.NOT_FOUND]: jsonContent(createMessageObjectSchema("App not found"), "App not found"),
    },
  }),
  AppsController.getById,
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
      [HttpStatusCodes.BAD_REQUEST]: jsonContent(createMessageObjectSchema("Bad request"), "Bad request"),
      [HttpStatusCodes.FORBIDDEN]: jsonContent(createMessageObjectSchema("Not owner"), "Not owner"),
      [HttpStatusCodes.NOT_FOUND]: jsonContent(createMessageObjectSchema("App not found"), "App not found"),
    },
  }),
  AppsController.update,
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
      [HttpStatusCodes.OK]: jsonContent(createMessageObjectSchema("Vote recorded"), "Vote recorded"),
      [HttpStatusCodes.BAD_REQUEST]: jsonContent(createMessageObjectSchema("Already voted"), "Already voted"),
      [HttpStatusCodes.NOT_FOUND]: jsonContent(createMessageObjectSchema("App not found"), "App not found"),
    },
  }),
  AppsController.vote,
)

export default router
