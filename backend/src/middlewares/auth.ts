import { eq } from "drizzle-orm"
import type { Context, Next } from "hono"
import { HTTPException } from "hono/http-exception"
import * as HttpStatusCodes from "stoker/http-status-codes"

import { db } from "../db"
import { users } from "../db/schema"
import type { AppBindings } from "../lib/types"

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export async function authMiddleware(c: Context<AppBindings>, next: Next) {
  const authHeader = c.req.header("Authorization")
  const customUserId = c.req.header("x-user-id")

  let identifier: string | undefined

  if (authHeader && authHeader.startsWith("Bearer ")) {
    identifier = authHeader.replace("Bearer ", "").trim()
  } else if (customUserId) {
    identifier = customUserId.trim()
  }

  if (!identifier) {
    throw new HTTPException(HttpStatusCodes.UNAUTHORIZED, {
      message: "Missing Authorization header or user identity token",
    })
  }

  const isUuid = UUID_REGEX.test(identifier)

  // Find user by id (if UUID) or tokenIdentifier (e.g. Clerk user_xxx or test token)
  const user = await db.query.users.findFirst({
    where: (u, { or, eq }) =>
      isUuid
        ? or(eq(u.id, identifier!), eq(u.tokenIdentifier, identifier!))
        : eq(u.tokenIdentifier, identifier!),
  })

  if (!user) {
    throw new HTTPException(HttpStatusCodes.UNAUTHORIZED, {
      message: "User not found or unauthenticated",
    })
  }

  c.set("user", {
    id: user.id,
    email: user.email,
    name: user.name,
    isAdmin: user.isAdmin,
  })

  await next()
}

export async function adminAuthMiddleware(c: Context<AppBindings>, next: Next) {
  await authMiddleware(c, async () => {
    const user = c.get("user")
    if (!user?.isAdmin) {
      throw new HTTPException(HttpStatusCodes.FORBIDDEN, {
        message: "Forbidden: Admin access required",
      })
    }
    await next()
  })
}
