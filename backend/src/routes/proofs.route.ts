import { createRoute, z } from "@hono/zod-openapi"
import { and, desc, eq, or, sql } from "drizzle-orm"
import * as HttpStatusCodes from "stoker/http-status-codes"
import { jsonContent, jsonContentRequired } from "stoker/openapi/helpers"
import { createMessageObjectSchema } from "stoker/openapi/schemas"

import { db } from "../db"
import { matches, notifications, proofs, users } from "../db/schema"
import { createRouter } from "../lib/create-app"
import { authMiddleware } from "../middlewares/auth"
import { sendExpoPushNotification } from "../services/expo-push"

const ProofSchema = z.object({
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
      [HttpStatusCodes.BAD_REQUEST]: jsonContent(
        createMessageObjectSchema("Invalid state or day"),
        "Invalid state",
      ),
      [HttpStatusCodes.FORBIDDEN]: jsonContent(
        createMessageObjectSchema("Forbidden"),
        "Forbidden",
      ),
    },
  }),
  async (c) => {
    const userVar = c.get("user")!
    const body = c.req.valid("json")

    const match = await db.query.matches.findFirst({
      where: eq(matches.id, body.matchId),
    })

    if (!match || match.status !== "active") {
      return c.json(
        { message: "Match is not active or does not exist" },
        HttpStatusCodes.BAD_REQUEST,
      )
    }

    const isUser1 = match.user1Id === userVar.id
    const isUser2 = match.user2Id === userVar.id

    if (!isUser1 && !isUser2) {
      return c.json({ message: "Forbidden: Not part of match" }, HttpStatusCodes.FORBIDDEN)
    }

    const partnerId = isUser1 ? match.user2Id : match.user1Id

    // Insert proof
    const [newProof] = await db
      .insert(proofs)
      .values({
        matchId: match.id,
        uploaderId: userVar.id,
        day: body.day,
        type: body.type,
        storageUrls: body.storageUrls,
        status: "pending",
        comment: body.comment,
      })
      .returning()

    const now = new Date()
    const proofSummary = {
      day: body.day,
      status: "pending",
      updatedAt: now.toISOString(),
    }

    // Update match lastProof
    await db
      .update(matches)
      .set({
        ...(isUser1 ? { user1LastProof: proofSummary } : { user2LastProof: proofSummary }),
        lastActivity: now,
        updatedAt: now,
      })
      .where(eq(matches.id, match.id))

    // Notify partner to review
    await db.insert(notifications).values({
      userId: partnerId,
      type: "proof_update",
      title: `Day ${body.day} Proof Uploaded! 📸`,
      body: `${userVar.name || "Your partner"} uploaded testing proof for Day ${body.day}. Please review it.`,
      data: { matchId: match.id, proofId: newProof.id, day: body.day },
    })

    const partner = await db.query.users.findFirst({
      where: eq(users.id, partnerId),
    })

    if (partner?.pushToken) {
      await sendExpoPushNotification({
        to: partner.pushToken,
        title: `Day ${body.day} Proof Uploaded! 📸`,
        body: `${userVar.name || "Your partner"} uploaded proof for Day ${body.day}. Review it now!`,
        data: { matchId: match.id, proofId: newProof.id },
      })
    }

    return c.json(newProof, HttpStatusCodes.CREATED)
  },
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
      [HttpStatusCodes.FORBIDDEN]: jsonContent(
        createMessageObjectSchema("Forbidden"),
        "Forbidden",
      ),
    },
  }),
  async (c) => {
    const { matchId } = c.req.valid("param")
    const userVar = c.get("user")!

    const match = await db.query.matches.findFirst({
      where: eq(matches.id, matchId),
    })

    if (!match || (match.user1Id !== userVar.id && match.user2Id !== userVar.id)) {
      return c.json({ message: "Forbidden: Not part of match" }, HttpStatusCodes.FORBIDDEN)
    }

    const items = await db.query.proofs.findMany({
      where: eq(proofs.matchId, matchId),
      orderBy: [desc(proofs.day), desc(proofs.submittedAt)],
    })

    return c.json(items, HttpStatusCodes.OK)
  },
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
      [HttpStatusCodes.NOT_FOUND]: jsonContent(
        createMessageObjectSchema("Not found"),
        "Not found",
      ),
      [HttpStatusCodes.FORBIDDEN]: jsonContent(
        createMessageObjectSchema("Cannot review"),
        "Cannot review",
      ),
    },
  }),
  async (c) => {
    const { id } = c.req.valid("param")
    const userVar = c.get("user")!
    const { status, rejectionReason } = c.req.valid("json")

    const proof = await db.query.proofs.findFirst({
      where: eq(proofs.id, id),
    })

    if (!proof) {
      return c.json({ message: "Proof not found" }, HttpStatusCodes.NOT_FOUND)
    }

    const match = await db.query.matches.findFirst({
      where: eq(matches.id, proof.matchId),
    })

    if (!match) {
      return c.json({ message: "Match not found" }, HttpStatusCodes.NOT_FOUND)
    }

    // Only the partner (app owner being tested) can review proof
    if (proof.uploaderId === userVar.id) {
      return c.json(
        { message: "You cannot review your own proof" },
        HttpStatusCodes.FORBIDDEN,
      )
    }

    const isUser1Uploader = match.user1Id === proof.uploaderId
    const now = new Date()

    const [updatedProof] = await db
      .update(proofs)
      .set({
        status,
        rejectionReason: status === "rejected" ? rejectionReason : null,
        reviewedAt: now,
      })
      .where(eq(proofs.id, id))
      .returning()

    // If approved, update approved count and check for match completion
    if (status === "approved") {
      const user1Approved = isUser1Uploader
        ? match.user1ApprovedCount + 1
        : match.user1ApprovedCount
      const user2Approved = !isUser1Uploader
        ? match.user2ApprovedCount + 1
        : match.user2ApprovedCount

      const bothCompleted = user1Approved >= 14 && user2Approved >= 14

      await db
        .update(matches)
        .set({
          user1ApprovedCount: user1Approved,
          user2ApprovedCount: user2Approved,
          status: bothCompleted ? "completed" : match.status,
          completedAt: bothCompleted ? now : match.completedAt,
          lastActivity: now,
          updatedAt: now,
        })
        .where(eq(matches.id, match.id))

      // If completed, boost reputation of both testers
      if (bothCompleted) {
        await db
          .update(users)
          .set({ reputation: sql`${users.reputation} + 20` })
          .where(or(eq(users.id, match.user1Id), eq(users.id, match.user2Id)))
      }
    }

    // Notify uploader of review result
    await db.insert(notifications).values({
      userId: proof.uploaderId,
      type: "proof_update",
      title: `Proof Day ${proof.day} ${status === "approved" ? "Approved! ✅" : "Rejected ⚠️"}`,
      body:
        status === "approved"
          ? `Your Day ${proof.day} proof was approved by your partner!`
          : `Your Day ${proof.day} proof was rejected: ${rejectionReason || "Please re-upload a clear screenshot"}`,
      data: { matchId: match.id, proofId: proof.id },
    })

    return c.json(updatedProof, HttpStatusCodes.OK)
  },
)

export default router
