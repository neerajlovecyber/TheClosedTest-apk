import { createRoute, z } from "@hono/zod-openapi"
import * as HttpStatusCodes from "stoker/http-status-codes"
import { jsonContent, jsonContentRequired } from "stoker/openapi/helpers"
import { createMessageObjectSchema } from "stoker/openapi/schemas"

import { ProofsController } from "../controllers/proofs.controller"
import { createRouter } from "../lib/create-app"
import { authMiddleware } from "../middlewares/auth"

export const ProofSchema = z.object({
  id: z.string(),
  matchId: z.string(),
  uploaderId: z.string(),
  day: z.number(),
  type: z.enum(["image", "video"]),
  storageUrls: z.array(z.string()),
  status: z.enum(["pending", "approved", "rejected"]),
  comment: z.string().nullable().optional(),
  rejectionReason: z.string().nullable().optional(),
  submittedAt: z.string().or(z.date()),
  reviewedAt: z.string().or(z.date()).nullable().optional(),
})

const SubmitProofSchema = z.object({
  matchId: z.string(),
  day: z.number().int().min(1).max(14),
  type: z.enum(["image", "video"]).default("image"),
  storageUrls: z.array(z.string()).min(1),
  comment: z.string().optional(),
})

const ReviewProofSchema = z.object({
  status: z.enum(["approved", "rejected"]),
  rejectionReason: z.string().optional(),
})

const router = createRouter()

// 1. Submit Daily Proof
router.openapi(
  createRoute({
    tags: ["Proofs"],
    method: "post",
    path: "/api/proofs",
    summary: "Submit Daily Testing Proof",
    middleware: [authMiddleware] as const,
    request: {
      body: jsonContentRequired(SubmitProofSchema, "Proof Submission Payload"),
    },
    responses: {
      [HttpStatusCodes.CREATED]: jsonContent(ProofSchema, "Proof submitted"),
      [HttpStatusCodes.BAD_REQUEST]: jsonContent(createMessageObjectSchema("Invalid state or day"), "Invalid state"),
      [HttpStatusCodes.FORBIDDEN]: jsonContent(createMessageObjectSchema("Forbidden"), "Forbidden"),
    },
  }),
  ProofsController.submit,
)

// 2. List Proofs for Match
router.openapi(
  createRoute({
    tags: ["Proofs"],
    method: "get",
    path: "/api/proofs/match/:matchId",
    summary: "Get All Proofs for a Match",
    middleware: [authMiddleware] as const,
    request: {
      params: z.object({ matchId: z.string() }),
    },
    responses: {
      [HttpStatusCodes.OK]: jsonContent(z.array(ProofSchema), "List of proofs"),
      [HttpStatusCodes.FORBIDDEN]: jsonContent(createMessageObjectSchema("Forbidden"), "Forbidden"),
    },
  }),
  ProofsController.listByMatch,
)

// 3. Review / Approve / Reject Proof
router.openapi(
  createRoute({
    tags: ["Proofs"],
    method: "post",
    path: "/api/proofs/:id/review",
    summary: "Approve or Reject Proof",
    middleware: [authMiddleware] as const,
    request: {
      params: z.object({ id: z.string() }),
      body: jsonContentRequired(ReviewProofSchema, "Review Payload"),
    },
    responses: {
      [HttpStatusCodes.OK]: jsonContent(ProofSchema, "Proof updated"),
      [HttpStatusCodes.BAD_REQUEST]: jsonContent(createMessageObjectSchema("Bad request"), "Bad request"),
      [HttpStatusCodes.NOT_FOUND]: jsonContent(createMessageObjectSchema("Not found"), "Not found"),
      [HttpStatusCodes.FORBIDDEN]: jsonContent(createMessageObjectSchema("Cannot review"), "Cannot review"),
    },
  }),
  ProofsController.review,
)

export default router
