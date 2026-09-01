import type { Context } from "hono"
import * as HttpStatusCodes from "stoker/http-status-codes"

import type { AppBindings } from "../lib/types"
import { AppService } from "../services/app.service"

export class AppsController {
  static async listPublic(c: Context<AppBindings>) {
    const query = (c.req as any).valid("query")
    const result = await AppService.listPublicApps(query)
    return c.json(result, HttpStatusCodes.OK)
  }

  static async listMine(c: Context<AppBindings>) {
    const userVar = c.get("user")!
    const result = await AppService.listUserApps(userVar.id)
    return c.json(result, HttpStatusCodes.OK)
  }

  static async getById(c: Context<AppBindings>) {
    const { id } = (c.req as any).valid("param")
    const app = await AppService.getAppById(id)
    if (!app) {
      return c.json({ message: "App not found" }, HttpStatusCodes.NOT_FOUND)
    }
    return c.json(app, HttpStatusCodes.OK)
  }

  static async create(c: Context<AppBindings>) {
    const userVar = c.get("user")!
    const body = (c.req as any).valid("json")
    try {
      const created = await AppService.createApp({
        ...body,
        userId: userVar.id,
      })
      return c.json(created, HttpStatusCodes.CREATED)
    } catch (err: any) {
      return c.json({ message: err.message || "Failed to create app" }, HttpStatusCodes.BAD_REQUEST)
    }
  }

  static async update(c: Context<AppBindings>) {
    const { id } = (c.req as any).valid("param")
    const userVar = c.get("user")!
    const body = (c.req as any).valid("json")

    try {
      const result = await AppService.updateApp(id, userVar.id, body)
      if (result.notFound) {
        return c.json({ message: "App not found" }, HttpStatusCodes.NOT_FOUND)
      }
      if (result.forbidden) {
        return c.json({ message: "Forbidden: Not owner of this app" }, HttpStatusCodes.FORBIDDEN)
      }
      return c.json(result.app, HttpStatusCodes.OK)
    } catch (err: any) {
      return c.json({ message: err.message || "Bad request" }, HttpStatusCodes.BAD_REQUEST)
    }
  }

  static async vote(c: Context<AppBindings>) {
    const { id } = (c.req as any).valid("param")
    const userVar = c.get("user")!
    const { type } = (c.req as any).valid("json")

    const result = await AppService.voteApp(id, userVar.id, type)
    if (result.notFound) {
      return c.json({ message: "App not found" }, HttpStatusCodes.NOT_FOUND)
    }
    if (result.alreadyVoted) {
      return c.json({ message: "You have already voted on this app" }, HttpStatusCodes.BAD_REQUEST)
    }
    return c.json({ message: "Vote recorded successfully" }, HttpStatusCodes.OK)
  }
}
