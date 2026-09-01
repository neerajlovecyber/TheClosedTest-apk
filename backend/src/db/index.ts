import fs from "node:fs"
import path from "node:path"
import { PGlite } from "@electric-sql/pglite"
import { pg_stat_statements } from "@electric-sql/pglite/contrib/pg_stat_statements"
import { pg_trgm } from "@electric-sql/pglite/contrib/pg_trgm"
import { drizzle as drizzlePglite } from "drizzle-orm/pglite"
import { drizzle as drizzlePg } from "drizzle-orm/postgres-js"
import postgres from "postgres"

import { env } from "../env"
import * as schema from "./schema"

export let pgliteInstance: PGlite | null = null

export let pgClient: postgres.Sql | null = null

function createDatabase() {
  if (env.NODE_ENV === "test" || process.env.NODE_ENV === "test") {
    const pglite = new PGlite({
      extensions: { pg_trgm, pg_stat_statements },
    })
    pgliteInstance = pglite
    try {
      const migrationsDir = path.resolve(import.meta.dirname, "./migrations")
      if (fs.existsSync(migrationsDir)) {
        const migrationFiles = fs
          .readdirSync(migrationsDir)
          .filter((file) => file.endsWith(".sql"))
          .sort()

        for (const file of migrationFiles) {
          const migrationSql = fs.readFileSync(path.join(migrationsDir, file), "utf8")
          const statements = migrationSql.split("--> statement-breakpoint")
          for (const stmt of statements) {
            const trimmed = stmt.trim()
            if (trimmed) {
              try {
                pglite.exec(trimmed).catch(() => {})
              } catch {}
            }
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
  pgClient = client

  return drizzlePg(client, { schema })
}

export const db = createDatabase()

export async function closeDatabase() {
  if (pgClient) {
    console.log("🔌 Closing PostgreSQL connection pool...")
    await pgClient.end({ timeout: 5 }).catch(() => {})
  }
  if (pgliteInstance) {
    await pgliteInstance.close().catch(() => {})
  }
}
