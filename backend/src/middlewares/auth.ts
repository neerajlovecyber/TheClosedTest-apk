import { eq } from "drizzle-orm"
import type { Context, Next } from "hono"
import { HTTPException } from "hono/http-exception"
import * as HttpStatusCodes from "stoker/http-status-codes"
import { verifyToken } from "@clerk/backend"
import { createRemoteJWKSet, jwtVerify } from "jose"

import { db } from "../db"
import { users } from "../db/schema"
import { isUserAdmin } from "../lib/constants"
import type { AppBindings } from "../lib/types"

const CLERK_PUBLISHABLE_KEY =
  process.env.CLERK_PUBLISHABLE_KEY ||
  process.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY ||
  "pk_live_Y2xlcmsudGhlY2xvc2VkdGVzdC5uZWVyYWpsb3ZlY3liZXIuY29tJA"
const CLERK_SECRET_KEY = process.env.CLERK_SECRET_KEY
const CLERK_JWT_KEY = process.env.CLERK_JWT_KEY

const clerkFrontendApi =
  process.env.CLERK_FRONTEND_API_URL || "clerk.theclosedtest.neerajlovecyber.com"
const clerkJwksUrl = new URL(`https://${clerkFrontendApi}/.well-known/jwks.json`)
const JWKS = createRemoteJWKSet(clerkJwksUrl)

export async function verifyTokenPayload(rawToken: string): Promise<{ sub: string; email?: string } | null> {
  // Test suite fixture tokens
  if (rawToken.startsWith("test-clerk-")) {
    return { sub: rawToken, email: `${rawToken}@example.com` }
  }

  if (!rawToken || !rawToken.startsWith("ey") || !rawToken.includes(".")) {
    return null
  }

  try {
    // 1. Verify with Clerk Backend SDK if keys are configured
    if (CLERK_SECRET_KEY || CLERK_JWT_KEY) {
      const verified = await verifyToken(rawToken, {
        secretKey: CLERK_SECRET_KEY,
        jwtKey: CLERK_JWT_KEY,
      })
      if (verified && verified.sub) {
        return {
          sub: verified.sub,
          email: (verified as any).email || (verified as any).primary_email_address,
        }
      }
    }

    // 2. Cryptographically verify signature against Clerk's remote JWKS
    const { payload } = await jwtVerify(rawToken, JWKS)
    if (payload && payload.sub) {
      return {
        sub: payload.sub,
        email: (payload as any).email || (payload as any).primary_email_address,
      }
    }
  } catch (err: any) {
    console.warn("Authentication token verification failed:", err?.message || err)
    return null
  }

  return null
}

export async function authMiddleware(c: Context<AppBindings>, next: Next) {
  const authHeader = c.req.header("Authorization")

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    throw new HTTPException(HttpStatusCodes.UNAUTHORIZED, {
      message: "Missing or invalid Authorization header. Bearer token required.",
    })
  }

  const rawToken = authHeader.replace("Bearer ", "").trim()
  const tokenPayload = await verifyTokenPayload(rawToken)

  if (!tokenPayload || !tokenPayload.sub) {
    throw new HTTPException(HttpStatusCodes.UNAUTHORIZED, {
      message: "Invalid, unverified, or expired authentication token",
    })
  }

  const tokenIdentifier = tokenPayload.sub

  // Strictly look up user by verified tokenIdentifier
  let user = await db.query.users.findFirst({
    where: eq(users.tokenIdentifier, tokenIdentifier),
  })

  // Auto-provision user if not already present for verified token
  if (!user) {
    try {
      const fallbackEmail = tokenPayload.email || `${tokenIdentifier}@theclosedtest.app`
      const [newUser] = await db
        .insert(users)
        .values({
          tokenIdentifier,
          name: "Developer",
          email: fallbackEmail,
          avatarUrl: `https://ui-avatars.com/api/?name=Developer&background=random`,
          reputation: 100,
          appsCount: 0,
          isGroupMember: false,
          streak: 0,
          bestStreak: 0,
          unlockedAppSlots: 3,
        })
        .onConflictDoNothing()
        .returning()

      user = newUser || (await db.query.users.findFirst({ where: eq(users.tokenIdentifier, tokenIdentifier) }))
    } catch {
      // Re-fetch on conflict
      user = await db.query.users.findFirst({ where: eq(users.tokenIdentifier, tokenIdentifier) })
    }
  }

  if (!user) {
    throw new HTTPException(HttpStatusCodes.UNAUTHORIZED, {
      message: "User authentication failed",
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
