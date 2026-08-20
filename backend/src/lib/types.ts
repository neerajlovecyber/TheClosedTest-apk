import type { OpenAPIHono, RouteConfig, RouteHandler } from "@hono/zod-openapi"
import type { PinoLogger } from "hono-pino"

export interface AppBindings {
  Variables: {
    logger: PinoLogger
    user?: {
      id: string
      email: string
      name?: string
      isAdmin?: boolean
    }
  }
}

export type AppOpenAPI = OpenAPIHono<AppBindings>

export type AppRouteHandler<R extends RouteConfig> = RouteHandler<R, AppBindings>
