import { pinoLogger as logger } from "hono-pino"
import pino from "pino"
import pretty from "pino-pretty"

import { env } from "../env"

export function pinoLogger() {
  return logger({
    pino: pino(
      {
        level: env.NODE_ENV === "test" ? "silent" : env.LOG_LEVEL,
      },
      env.NODE_ENV === "production" || env.NODE_ENV === "test" ? undefined : pretty(),
    ),
    http: {
      reqId: () => crypto.randomUUID(),
    },
  })
}
