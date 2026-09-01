import type { Context } from "hono"
import * as HttpStatusCodes from "stoker/http-status-codes"

import { NotificationService } from "../services/notification.service"

export class NotificationsController {
  static async list(c: Context) {
    const userVar = c.get("user")!
    const result = await NotificationService.getUserNotifications(userVar.id)
    return c.json(result, HttpStatusCodes.OK)
  }

  static async markRead(c: Context) {
    const { id } = c.req.valid("param" as never) as { id: string }
    const userVar = c.get("user")!
    await NotificationService.markAsRead(id, userVar.id)
    return c.json({ message: "Notification marked as read" }, HttpStatusCodes.OK)
  }

  static async markAllRead(c: Context) {
    const userVar = c.get("user")!
    await NotificationService.markAllAsRead(userVar.id)
    return c.json({ message: "All notifications marked as read" }, HttpStatusCodes.OK)
  }

  static async clearAll(c: Context) {
    const userVar = c.get("user")!
    await NotificationService.clearAll(userVar.id)
    return c.json({ message: "All notifications deleted" }, HttpStatusCodes.OK)
  }

  static async deleteOne(c: Context) {
    const { id } = c.req.valid("param" as never) as { id: string }
    const userVar = c.get("user")!
    await NotificationService.deleteNotification(id, userVar.id)
    return c.json({ message: "Notification deleted" }, HttpStatusCodes.OK)
  }
}
