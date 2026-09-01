import { and, desc, eq } from "drizzle-orm"

import { db } from "../db"
import { matches, proofs } from "../db/schema"
import { NotificationService } from "./notification.service"
import { deleteMultipleObjectsFromR2 } from "./r2-storage"
import { ReputationService } from "./reputation.service"

export interface SubmitProofDTO {
  userId: string
  userName?: string
  matchId: string
  day: number
  type: "image" | "video"
  storageUrls: string[]
  comment?: string
}

export interface ReviewProofDTO {
  reviewerId: string
  proofId: string
  status: "approved" | "rejected"
  rejectionReason?: string
}

export class ProofService {
  /**
   * Submits daily testing proof, replacing any previous draft for the same day.
   */
  static async submitProof(dto: SubmitProofDTO) {
    const match = await db.query.matches.findFirst({
      where: (m, { eq }) => eq(m.id, dto.matchId),
    })

    if (!match || (match.status !== "active" && match.status !== "pending")) {
      throw new Error("Match is not active or does not exist")
    }

    // Auto-activate match if it was still pending
    if (match.status === "pending") {
      await db.update(matches).set({ status: "active", startDate: new Date() }).where(eq(matches.id, match.id))
    }

    const isUser1 = match.user1Id === dto.userId
    const isUser2 = match.user2Id === dto.userId

    if (!isUser1 && !isUser2) {
      throw new Error("Forbidden: Not part of match")
    }

    const partnerId = isUser1 ? match.user2Id : match.user1Id

    // Check if proof exists for this day to replace
    const existingProof = await db.query.proofs.findFirst({
      where: (p, { and, eq }) => and(eq(p.matchId, match.id), eq(p.uploaderId, dto.userId), eq(p.day, dto.day)),
    })

    let newProof: any

    if (existingProof) {
      if (existingProof.storageUrls && existingProof.storageUrls.length > 0) {
        deleteMultipleObjectsFromR2(existingProof.storageUrls).catch((e) =>
          console.error("Failed to delete replaced proof files from R2:", e),
        )
      }

      const [updated] = await db
        .update(proofs)
        .set({
          storageUrls: dto.storageUrls,
          status: "pending",
          comment: dto.comment,
          type: dto.type,
          submittedAt: new Date(),
        })
        .where(eq(proofs.id, existingProof.id))
        .returning()
      newProof = updated
    } else {
      const [inserted] = await db
        .insert(proofs)
        .values({
          matchId: match.id,
          uploaderId: dto.userId,
          day: dto.day,
          type: dto.type,
          storageUrls: dto.storageUrls,
          status: "pending",
          comment: dto.comment,
        })
        .returning()
      newProof = inserted
    }

    const now = new Date()
    const proofSummary = {
      day: dto.day,
      status: "pending",
      updatedAt: now.toISOString(),
    }

    await db
      .update(matches)
      .set({
        ...(isUser1 ? { user1LastProof: proofSummary } : { user2LastProof: proofSummary }),
        lastActivity: now,
        updatedAt: now,
      })
      .where(eq(matches.id, match.id))

    // Notify partner to review
    NotificationService.send({
      userId: partnerId,
      type: "proof_update",
      title: `Day ${dto.day} Proof Uploaded!`,
      body: `${dto.userName || "Your partner"} uploaded testing proof for Day ${dto.day}. Please review it.`,
      pushBody: `${dto.userName || "Your partner"} uploaded proof for Day ${dto.day}. Review it now!`,
      data: { matchId: match.id, proofId: newProof.id, day: dto.day },
    }).catch(() => {})

    return newProof
  }

  /**
   * Lists all proofs submitted for a given match.
   */
  static async listMatchProofs(matchId: string, userId: string) {
    const match = await db.query.matches.findFirst({
      where: (m, { eq }) => eq(m.id, matchId),
    })

    if (!match || (match.user1Id !== userId && match.user2Id !== userId)) {
      throw new Error("Forbidden: Not part of match")
    }

    return db.query.proofs.findMany({
      where: (p, { eq }) => eq(p.matchId, matchId),
      orderBy: [desc(proofs.day), desc(proofs.submittedAt)],
    })
  }

  /**
   * Reviews and approves/rejects a proof submission within an ACID database transaction.
   */
  static async reviewProof(dto: ReviewProofDTO) {
    const proof = await db.query.proofs.findFirst({
      where: (p, { eq }) => eq(p.id, dto.proofId),
    })

    if (!proof) {
      return { notFound: true }
    }

    const match = await db.query.matches.findFirst({
      where: (m, { eq }) => eq(m.id, proof.matchId),
    })

    if (!match) {
      return { notFound: true }
    }

    // Only testing partner can review proof
    if (proof.uploaderId === dto.reviewerId) {
      return { forbidden: true }
    }

    const isUser1Uploader = match.user1Id === proof.uploaderId
    const now = new Date()

    let updatedProof: any

    // ACID Transaction wrapping proof update, reputation ledger, and match status
    await db.transaction(async (tx) => {
      const [updated] = await tx
        .update(proofs)
        .set({
          status: dto.status,
          rejectionReason: dto.status === "rejected" ? dto.rejectionReason : null,
          reviewedAt: now,
        })
        .where(eq(proofs.id, dto.proofId))
        .returning()

      updatedProof = updated

      const proofSummary = {
        day: proof.day,
        status: dto.status,
        updatedAt: now.toISOString(),
      }

      const updateFields: any = {
        ...(isUser1Uploader ? { user1LastProof: proofSummary } : { user2LastProof: proofSummary }),
        lastActivity: now,
        updatedAt: now,
      }

      if (dto.status === "approved") {
        // Reward uploader +1 reputation
        await ReputationService.changeReputation({
          userId: proof.uploaderId,
          delta: 1,
          reason: "proof_approved",
          referenceId: proof.id,
          tx,
        })

        const user1Approved = isUser1Uploader ? match.user1ApprovedCount + 1 : match.user1ApprovedCount
        const user2Approved = !isUser1Uploader ? match.user2ApprovedCount + 1 : match.user2ApprovedCount
        const bothCompleted = user1Approved >= 14 && user2Approved >= 14

        updateFields.user1ApprovedCount = user1Approved
        updateFields.user2ApprovedCount = user2Approved
        updateFields.status = bothCompleted ? "completed" : match.status
        updateFields.completedAt = bothCompleted ? now : match.completedAt

        // If completed 14 days, reward both users +20 reputation
        if (bothCompleted) {
          await ReputationService.changeReputation({
            userId: match.user1Id,
            delta: 20,
            reason: "match_completed",
            referenceId: match.id,
            tx,
          })
          await ReputationService.changeReputation({
            userId: match.user2Id,
            delta: 20,
            reason: "match_completed",
            referenceId: match.id,
            tx,
          })
        }
      } else if (dto.status === "rejected") {
        // Deduct 5 reputation for rejected proof (clamped at 0)
        await ReputationService.changeReputation({
          userId: proof.uploaderId,
          delta: -5,
          reason: "proof_rejected",
          referenceId: proof.id,
          tx,
        })
      }

      await tx.update(matches).set(updateFields).where(eq(matches.id, match.id))
    })

    // Notify uploader of review result
    const notificationTitle = `Proof Day ${proof.day} ${dto.status === "approved" ? "Approved!" : "Rejected"}`
    const notificationBody =
      dto.status === "approved"
        ? `Your Day ${proof.day} proof was approved by your partner!`
        : `Your Day ${proof.day} proof was rejected: ${dto.rejectionReason || "Please re-upload a clear screenshot"}`

    NotificationService.send({
      userId: proof.uploaderId,
      type: "proof_update",
      title: notificationTitle,
      body: notificationBody,
      data: { matchId: match.id, proofId: proof.id, status: dto.status },
    }).catch(() => {})

    return { proof: updatedProof }
  }
}
