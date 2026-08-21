import { eq } from "drizzle-orm"
import type { Context, Next } from "hono"
import { HTTPException } from "hono/http-exception"
import * as HttpStatusCodes from "stoker/http-status-codes"

import { db } from "../db"
import { users } from "../db/schema"
import { isUserAdmin } from "../lib/constants"
import type { AppBindings } from "../lib/types"

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export async function authMiddleware(c: Context<AppBindings>, next: Next) {
  const authHeader = c.req.header("Authorization")
  const customUserId = c.req.header("x-user-id")

  let identifier: string | undefined

  if (authHeader && authHeader.startsWith("Bearer ")) {
    const rawToken = authHeader.replace("Bearer ", "").trim()
    if (rawToken.startsWith("ey") && rawToken.includes(".")) {
      try {
        const parts = rawToken.split(".")
        if (parts.length >= 2) {
          const payloadJson = Buffer.from(parts[1], "base64").toString("utf8")
          const decoded = JSON.parse(payloadJson)
          identifier = decoded.sub || rawToken
        } else {
          identifier = rawToken
        }
      } catch {
        identifier = rawToken
      }
    } else {
      identifier = rawToken
    }
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
  let user = await db.query.users.findFirst({
    where: (u, { or, eq }) =>
      isUuid
        ? or(eq(u.id, identifier!), eq(u.tokenIdentifier, identifier!))
        : eq(u.tokenIdentifier, identifier!),
  })

  if (!user && !isUuid) {
    // Auto-create user on the fly for Clerk authenticated sessions
    try {
      const [newUser] = await db
        .insert(users)
        .values({
          tokenIdentifier: identifier,
          name: "Developer",
          email: `${identifier}@theclosedtest.app`,
          avatarUrl: `https://ui-avatars.com/api/?name=Developer&background=random`,
          reputation: 100,
          appsCount: 0,
          isGroupMember: false,
          streak: 0,
          bestStreak: 0,
        })
        .returning()
      user = newUser
    } catch {
      // ignore
    }
  }

  if (!user) {
    throw new HTTPException(HttpStatusCodes.UNAUTHORIZED, {
      message: "User not found or unauthenticated",
    })
  }

  const isAdminUser = isUserAdmin(user.email, user.isAdmin)

  c.set("user", {
    id: user.id,
    tokenIdentifier: user.tokenIdentifier,
    email: user.email,
    name: user.name,
    isAdmin: isAdminUser,
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
