import { rateLimiter } from "hono-rate-limiter"
import type { AppBindings } from "../lib/types"

function getClientIp(c: any): string {
  const cfIp = c.req.header("cf-connecting-ip")
  if (cfIp) return cfIp.trim()

  const xRealIp = c.req.header("x-real-ip")
  if (xRealIp) return xRealIp.trim()

  const xForwardedFor = c.req.header("x-forwarded-for")
  if (xForwardedFor) {
    // Handle proxy chains where header is "client, proxy1, proxy2"
    return xForwardedFor.split(",")[0].trim()
  }

  return "127.0.0.1"
}

/**
 * Global rate limiter: 300 requests per minute per IP address
 * (Generous to ensure users on shared Wi-Fi, offices, or mobile networks never experience throttling)
 */
export const globalRateLimiter = rateLimiter<AppBindings>({
  windowMs: 60 * 1000, // 1 minute
  limit: 300, // 300 requests per minute (~5 req/sec)
  standardHeaders: "draft-6",
  skip: () => process.env.NODE_ENV === "test",
  keyGenerator: (c) => getClientIp(c),
})

/**
 * Sensitive endpoints limiter: 60 requests per minute per user/IP
 * (For Presigned uploads, Match requests, App creation)
 */
export const sensitiveActionLimiter = rateLimiter<AppBindings>({
  windowMs: 60 * 1000,
  limit: 60, // 60 requests per minute (plenty for 5-image proof uploads)
  standardHeaders: "draft-6",
  skip: () => process.env.NODE_ENV === "test",
  keyGenerator: (c) => {
    const user = c.get("user")
    return user?.id ? `user:${user.id}` : `ip:${getClientIp(c)}`
  },
})
