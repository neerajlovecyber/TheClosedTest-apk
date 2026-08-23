import fs from "node:fs"
import path from "node:path"
import { PGlite } from "@electric-sql/pglite"
import { drizzle as drizzlePglite } from "drizzle-orm/pglite"
import { drizzle as drizzlePg } from "drizzle-orm/postgres-js"
import postgres from "postgres"

import { env } from "../env"
import * as schema from "./schema"

export let pgliteInstance: PGlite | null = null

function createDatabase() {
  if (env.NODE_ENV === "test" || process.env.NODE_ENV === "test") {
    const pglite = new PGlite()
    pgliteInstance = pglite
    try {
      const sqlPath = path.resolve(import.meta.dirname, "./migrations/0000_initial_schema.sql")
      if (fs.existsSync(sqlPath)) {
        const migrationSql = fs.readFileSync(sqlPath, "utf8")
        const statements = migrationSql.split("--> statement-breakpoint")
        for (const stmt of statements) {
          const trimmed = stmt.trim()
          if (trimmed) {
            try {
              pglite.exec(trimmed)
            } catch {}
          }
        }
      }
    } catch {}
    return drizzlePglite(pglite, { schema }) as unknown as ReturnType<typeof drizzlePg<typeof schema>>
  }

  const client = postgres(env.DATABASE_URL, {
    ssl: env.DATABASE_URL.includes("sslmode=require") ? "require" : undefined,
    max: 10,
    idle_timeout: 20,
    connect_timeout: 30,
  })

  return drizzlePg(client, { schema })
}

export const db = createDatabase()
