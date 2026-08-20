import { apiReference } from "@scalar/hono-api-reference"

import type { AppOpenAPI } from "./types"

export function configureOpenAPI(app: AppOpenAPI) {
  app.doc("/doc", {
    openapi: "3.0.0",
    info: {
      version: "1.0.0",
      title: "TheClosedTest API",
      description: "Backend REST & OpenAPI API for TheClosedTest Android Testing Platform",
    },
  })

  app.get(
    "/reference",
    apiReference({
      theme: "saturn",
      layout: "modern",
      defaultHttpClient: {
        targetKey: "js",
        clientKey: "fetch",
      },
      spec: {
        url: "/doc",
      },
    }),
  )
}
