import { createRoute, z } from "@hono/zod-openapi"
import { and, desc, eq, sql } from "drizzle-orm"
import * as HttpStatusCodes from "stoker/http-status-codes"
import { jsonContent } from "stoker/openapi/helpers"
import { createMessageObjectSchema } from "stoker/openapi/schemas"

import { db } from "../db"
import { notifications } from "../db/schema"
import { createRouter } from "../lib/create-app"
import { authMiddleware } from "../middlewares/auth"

const NotificationSchema = z.object({
  id: z.string(),
  userId: z.string(),
  type: z.enum(["request", "acceptance", "reminder", "proof_update", "message"]),
  title: z.string(),
  body: z.string(),
  data: z.any(),
  read: z.boolean(),
  isRead: z.boolean().optional(),
  createdAt: z.string().or(z.date()),
})

const router = createRouter()

// 1. Get Notifications List + Unread Count
router.openapi(
  createRoute({
    tags: ["Notifications"],
    method: "get",
    path: "/api/notifications",
    summary: "Get In-App Notifications",
    middleware: [authMiddleware] as const,
    responses: {
      [HttpStatusCodes.OK]: jsonContent(
        z.object({
          notifications: z.array(NotificationSchema),
          unreadCount: z.number(),
        }),
        "User notifications",
      ),
    },
  }),
  async (c) => {
    const userVar = c.get("user")!

    const items = await db.query.notifications.findMany({
      where: eq(notifications.userId, userVar.id),
      orderBy: [desc(notifications.createdAt)],
      limit: 50,
    })

    const formatted = items.map((n) => ({
      ...n,
      isRead: n.read,
    }))

    const unreadCount = formatted.filter((n) => !n.read).length

    return c.json(
      {
        notifications: formatted,
        unreadCount,
      },
      HttpStatusCodes.OK,
    )
  },
)

// 2. Mark Single Notification as Read
router.openapi(
  createRoute({
    tags: ["Notifications"],
    method: "patch",
    path: "/api/notifications/:id/read",
    summary: "Mark Notification as Read",
    middleware: [authMiddleware] as const,
    request: {
      params: z.object({ id: z.string() }),
    },
    responses: {
      [HttpStatusCodes.OK]: jsonContent(
        createMessageObjectSchema("Notification marked as read"),
        "Marked as read",
      ),
    },
  }),
  async (c) => {
    const { id } = c.req.valid("param")
    const userVar = c.get("user")!

    await db
      .update(notifications)
      .set({ read: true })
      .where(and(eq(notifications.id, id), eq(notifications.userId, userVar.id)))

    return c.json({ message: "Notification marked as read" }, HttpStatusCodes.OK)
  },
)

// 3. Mark All Notifications as Read
router.openapi(
  createRoute({
    tags: ["Notifications"],
    method: "post",
    path: "/api/notifications/read-all",
    summary: "Mark All Notifications as Read",
    middleware: [authMiddleware] as const,
    responses: {
      [HttpStatusCodes.OK]: jsonContent(
        createMessageObjectSchema("All notifications marked as read"),
        "Marked all read",
      ),
    },
  }),
  async (c) => {
    const userVar = c.get("user")!

    await db
      .update(notifications)
      .set({ read: true })
      .where(eq(notifications.userId, userVar.id))

    return c.json({ message: "All notifications marked as read" }, HttpStatusCodes.OK)
  },
)

// 4. Delete All Notifications (Clear Inbox)
router.openapi(
  createRoute({
    tags: ["Notifications"],
    method: "delete",
    path: "/api/notifications/clear-all",
    summary: "Delete All Notifications for User",
    middleware: [authMiddleware] as const,
    responses: {
      [HttpStatusCodes.OK]: jsonContent(
        createMessageObjectSchema("All notifications deleted"),
        "All notifications deleted",
      ),
    },
  }),
  async (c) => {
    const userVar = c.get("user")!

    await db
      .delete(notifications)
      .where(eq(notifications.userId, userVar.id))

    return c.json({ message: "All notifications deleted" }, HttpStatusCodes.OK)
  },
)

router.openapi(
  createRoute({
    tags: ["Notifications"],
    method: "post",
    path: "/api/notifications/clear-all",
    summary: "Delete All Notifications for User (POST Alias)",
    middleware: [authMiddleware] as const,
    responses: {
      [HttpStatusCodes.OK]: jsonContent(
        createMessageObjectSchema("All notifications deleted"),
        "All notifications deleted",
      ),
    },
  }),
  async (c) => {
    const userVar = c.get("user")!

    await db
      .delete(notifications)
      .where(eq(notifications.userId, userVar.id))

    return c.json({ message: "All notifications deleted" }, HttpStatusCodes.OK)
  },
)

// 5. Delete Single Notification
router.openapi(
  createRoute({
    tags: ["Notifications"],
    method: "delete",
    path: "/api/notifications/:id",
    summary: "Delete Notification",
    middleware: [authMiddleware] as const,
    request: {
      params: z.object({ id: z.string() }),
    },
    responses: {
      [HttpStatusCodes.OK]: jsonContent(
        createMessageObjectSchema("Notification deleted"),
        "Notification deleted",
      ),
    },
  }),
  async (c) => {
    const { id } = c.req.valid("param")
    const userVar = c.get("user")!

    await db
      .delete(notifications)
      .where(and(eq(notifications.id, id), eq(notifications.userId, userVar.id)))

    return c.json({ message: "Notification deleted" }, HttpStatusCodes.OK)
  },
)

export default router
