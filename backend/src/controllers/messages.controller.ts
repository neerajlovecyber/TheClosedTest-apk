import type { Context } from "hono"
import * as HttpStatusCodes from "stoker/http-status-codes"

import { MessageService, type SendMessageDTO } from "../services/message.service"

export class MessagesController {
  static async getHistory(c: Context) {
    const { matchId } = c.req.valid("param" as never) as { matchId: string }
    const { limit, offset } = c.req.valid("query" as never) as { limit: number; offset: number }
    const userVar = c.get("user")!

    const result = await MessageService.getHistory(matchId, userVar.id, limit, offset)

    if ("forbidden" in result) {
      return c.json({ message: "Forbidden: Not part of match" }, HttpStatusCodes.FORBIDDEN)
    }

    return c.json(result.items, HttpStatusCodes.OK)
  }

  static async sendMessage(c: Context) {
    const { matchId } = c.req.valid("param" as never) as { matchId: string }
    const userVar = c.get("user")!
    const body = c.req.valid("json" as never) as SendMessageDTO

    const result = await MessageService.sendMessage(matchId, userVar, body)

    if ("forbidden" in result) {
      return c.json({ message: "Forbidden: Not part of match" }, HttpStatusCodes.FORBIDDEN)
    }

    return c.json(result.message, HttpStatusCodes.CREATED)
  }

  static async markRead(c: Context) {
    const { matchId } = c.req.valid("param" as never) as { matchId: string }
    const userVar = c.get("user")!

    const result = await MessageService.markRead(matchId, userVar.id)

    if ("forbidden" in result) {
      return c.json({ message: "Forbidden: Not part of match" }, HttpStatusCodes.FORBIDDEN)
    }

    return c.json({ message: "Chat marked as read" }, HttpStatusCodes.OK)
  }
}
