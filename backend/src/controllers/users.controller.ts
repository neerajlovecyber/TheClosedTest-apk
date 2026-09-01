import type { Context } from "hono"
import * as HttpStatusCodes from "stoker/http-status-codes"

import { presence } from "../lib/presence"
import type { AppBindings } from "../lib/types"
import { UserService } from "../services/user.service"

export class UsersController {
  static async sync(c: Context<AppBindings>) {
    const authUser = c.get("user")!
    const body = (c.req as any).valid("json")

    try {
      const result = await UserService.syncUser({
        tokenIdentifier: authUser.tokenIdentifier!,
        name: body.name || authUser.name || "Developer",
        email: body.email || authUser.email,
        avatarUrl: body.avatarUrl,
      })

      return c.json(result.user, result.isNew ? HttpStatusCodes.CREATED : HttpStatusCodes.OK)
    } catch (err: any) {
      return c.json({ message: err.message || "Invalid sync request" }, HttpStatusCodes.BAD_REQUEST)
    }
  }

  static async me(c: Context<AppBindings>) {
    const userVar = c.get("user")!
    const profile = await UserService.getUserProfile(userVar.id)

    if (!profile) {
      return c.json({ message: "User not found" }, HttpStatusCodes.NOT_FOUND)
    }

    return c.json(profile, HttpStatusCodes.OK)
  }

  static async checkin(c: Context<AppBindings>) {
    const userVar = c.get("user")!
    const result = await UserService.checkInDailyStreak(userVar.id)

    if (!result) {
      return c.json({ message: "User not found" }, HttpStatusCodes.NOT_FOUND)
    }

    return c.json(result, HttpStatusCodes.OK)
  }

  static async updatePushToken(c: Context<AppBindings>) {
    const userVar = c.get("user")!
    const { pushToken } = (c.req as any).valid("json")

    await UserService.updatePushToken(userVar.id, pushToken)
    return c.json({ message: "Push token updated successfully" }, HttpStatusCodes.OK)
  }

  static async confirmGoogleGroup(c: Context<AppBindings>) {
    const userVar = c.get("user")!

    await UserService.confirmGoogleGroup(userVar.id)
    return c.json({ message: "Google Group membership confirmed" }, HttpStatusCodes.OK)
  }

  static async updateProfile(c: Context<AppBindings>) {
    const userVar = c.get("user")!
    const body = (c.req as any).valid("json")

    const updated = await UserService.updateProfile(userVar.id, body)
    return c.json(updated, HttpStatusCodes.OK)
  }

  static async unlockSlots(c: Context<AppBindings>) {
    const userVar = c.get("user")!

    const updated = await UserService.unlockAppSlots(userVar.id)
    return c.json(updated, HttpStatusCodes.OK)
  }

  static activeCount(c: Context<AppBindings>) {
    return c.json(
      {
        active5m: presence.getActiveCount(5),
        active15m: presence.getActiveCount(15),
        active1h: presence.getActiveCount(60),
      },
      HttpStatusCodes.OK,
    )
  }
}
