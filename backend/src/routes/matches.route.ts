import { createRoute, z } from "@hono/zod-openapi"
import * as HttpStatusCodes from "stoker/http-status-codes"
import { jsonContent, jsonContentRequired } from "stoker/openapi/helpers"
import { createMessageObjectSchema } from "stoker/openapi/schemas"

import { MatchesController } from "../controllers/matches.controller"
import { createRouter } from "../lib/create-app"
import { authMiddleware } from "../middlewares/auth"

export const MatchSchema = z.object({
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
  isUser1: z.boolean().optional(),
  myApp: z.any().optional(),
  partnerApp: z.any().optional(),
  partnerUser: z.any().optional(),
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
  MatchesController.request,
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
  MatchesController.listMine,
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
  MatchesController.getById,
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
  MatchesController.accept,
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
  MatchesController.rejectOrCancel,
)

export default router
