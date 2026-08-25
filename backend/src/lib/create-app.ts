import { OpenAPIHono } from "@hono/zod-openapi"
import { compress } from "hono/compress"
import { cors } from "hono/cors"
import { secureHeaders } from "hono/secure-headers"
import { notFound, onError, serveEmojiFavicon } from "stoker/middlewares"
import { defaultHook } from "stoker/openapi"

import { pinoLogger } from "../middlewares/pino-logger"
import { globalRateLimiter } from "../middlewares/rate-limiter"
import type { AppBindings, AppOpenAPI } from "./types"

export function createRouter(): AppOpenAPI {
  return new OpenAPIHono<AppBindings>({
    strict: false,
    defaultHook,
  })
}

export function createApp(): AppOpenAPI {
  const app = createRouter()

  app.use(serveEmojiFavicon("🚀"))
  app.use(cors())
  app.use(secureHeaders())
  app.use(compress())
  app.use(pinoLogger())
  app.use(globalRateLimiter)

  app.notFound(notFound)
  app.onError(onError)

  return app
}
