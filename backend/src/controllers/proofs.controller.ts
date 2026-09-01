import type { Context } from "hono"
import * as HttpStatusCodes from "stoker/http-status-codes"

import type { AppBindings } from "../lib/types"
import { ProofService } from "../services/proof.service"

export class ProofsController {
  static async submit(c: Context<AppBindings>) {
    const userVar = c.get("user")!
    const body = (c.req as any).valid("json")

    try {
      const proof = await ProofService.submitProof({
        ...body,
        userId: userVar.id,
        userName: userVar.name,
      })
      return c.json(proof, HttpStatusCodes.CREATED)
    } catch (err: any) {
      return c.json({ message: err.message || "Failed to submit proof" }, HttpStatusCodes.BAD_REQUEST)
    }
  }

  static async listByMatch(c: Context<AppBindings>) {
    const { matchId } = (c.req as any).valid("param")
    const userVar = c.get("user")!

    try {
      const items = await ProofService.listMatchProofs(matchId, userVar.id)
      return c.json(items, HttpStatusCodes.OK)
    } catch (err: any) {
      return c.json({ message: err.message || "Forbidden: Not part of match" }, HttpStatusCodes.FORBIDDEN)
    }
  }

  static async review(c: Context<AppBindings>) {
    const { id } = (c.req as any).valid("param")
    const userVar = c.get("user")!
    const { status, rejectionReason } = (c.req as any).valid("json")

    try {
      const result = await ProofService.reviewProof({
        reviewerId: userVar.id,
        proofId: id,
        status,
        rejectionReason,
      })

      if (result.notFound) {
        return c.json({ message: "Proof not found" }, HttpStatusCodes.NOT_FOUND)
      }
      if (result.forbidden) {
        return c.json({ message: "You cannot review your own proof" }, HttpStatusCodes.FORBIDDEN)
      }

      return c.json(result.proof, HttpStatusCodes.OK)
    } catch (err: any) {
      return c.json({ message: err.message || "Failed to review proof" }, HttpStatusCodes.BAD_REQUEST)
    }
  }
}
