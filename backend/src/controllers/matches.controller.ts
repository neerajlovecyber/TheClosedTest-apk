import type { Context } from "hono"
import * as HttpStatusCodes from "stoker/http-status-codes"

import type { AppBindings } from "../lib/types"
import { MatchService } from "../services/match.service"

export class MatchesController {
  static async request(c: Context<AppBindings>) {
    const userVar = c.get("user")!
    const body = (c.req as any).valid("json")

    try {
      const match = await MatchService.requestMatch({
        userId: userVar.id,
        userName: userVar.name,
        ...body,
      })
      return c.json(match, HttpStatusCodes.CREATED)
    } catch (err: any) {
      return c.json({ message: err.message || "Failed to request match" }, HttpStatusCodes.BAD_REQUEST)
    }
  }

  static async listMine(c: Context<AppBindings>) {
    const userVar = c.get("user")!
    const { status } = (c.req as any).valid("query")
    const matches = await MatchService.listUserMatches(userVar.id, userVar.tokenIdentifier, status)
    return c.json(matches, HttpStatusCodes.OK)
  }

  static async getById(c: Context<AppBindings>) {
    const { id } = (c.req as any).valid("param")
    const userVar = c.get("user")!

    const result = await MatchService.getMatchById(id, userVar.id)
    if ("notFound" in result) {
      return c.json({ message: "Match not found" }, HttpStatusCodes.NOT_FOUND)
    }
    if ("forbidden" in result) {
      return c.json({ message: "Forbidden: Not part of this match" }, HttpStatusCodes.FORBIDDEN)
    }

    return c.json(
      {
        ...result.match,
        match: result.match,
        app1: result.app1,
        app2: result.app2,
        user1: result.user1,
        user2: result.user2,
      },
      HttpStatusCodes.OK,
    )
  }

  static async accept(c: Context<AppBindings>) {
    const { id } = (c.req as any).valid("param")
    const userVar = c.get("user")!

    try {
      const updated = await MatchService.acceptMatch(id, userVar.id)
      return c.json(updated, HttpStatusCodes.OK)
    } catch (err: any) {
      return c.json({ message: err.message || "Failed to accept match" }, HttpStatusCodes.FORBIDDEN)
    }
  }

  static async rejectOrCancel(c: Context<AppBindings>) {
    const { id } = (c.req as any).valid("param")
    const userVar = c.get("user")!

    try {
      const updated = await MatchService.rejectOrCancelMatch(id, userVar.id, userVar.name)
      return c.json(updated, HttpStatusCodes.OK)
    } catch (err: any) {
      return c.json({ message: err.message || "Forbidden: Not part of match" }, HttpStatusCodes.FORBIDDEN)
    }
  }
}
