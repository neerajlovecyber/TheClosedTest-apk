import fs from "node:fs"
import path from "node:path"
import postgres from "postgres"

import { env } from "../env"

async function runMigration() {
  console.log("Connecting to database...")
  const sql = postgres(env.DATABASE_URL, {
    ssl: env.DATABASE_URL.includes("sslmode=require") ? "require" : undefined,
    max: 1,
  })

  try {
    // 1. Ensure migrations tracking table exists in the permitted 'public' schema
    await sql.unsafe(`
      CREATE TABLE IF NOT EXISTS "__drizzle_migrations" (
        "id" SERIAL PRIMARY KEY,
        "name" text UNIQUE NOT NULL,
        "applied_at" timestamp with time zone DEFAULT now() NOT NULL
      );
    `)

    // 2. Query already applied migrations
    const appliedRows = await sql`SELECT "name" FROM "__drizzle_migrations"`
    const appliedNames = new Set(appliedRows.map((r) => r.name))

    // 3. Auto-bootstrap baseline: if existing tables are present, mark baseline migrations as applied
    if (!appliedNames.has("0000_initial_schema.sql")) {
      const checkUsers = await sql`
        SELECT table_name FROM information_schema.tables 
        WHERE table_schema = 'public' AND table_name = 'users'
      `
      if (checkUsers.length > 0) {
        console.log("Existing production schema detected. Registering baseline migrations...")
        await sql.unsafe(`
          INSERT INTO "__drizzle_migrations" ("name") VALUES 
            ('0000_initial_schema.sql'),
            ('0001_add_pg_extensions_and_trgm_indexes.sql')
          ON CONFLICT ("name") DO NOTHING;
        `)
        appliedNames.add("0000_initial_schema.sql")
        appliedNames.add("0001_add_pg_extensions_and_trgm_indexes.sql")
      }
    }

    // 4. Read all migration files
    const migrationsDir = path.resolve(import.meta.dirname, "./migrations")
    if (!fs.existsSync(migrationsDir)) {
      console.log("No migrations directory found.")
      return
    }

    const migrationFiles = fs
      .readdirSync(migrationsDir)
      .filter((file) => file.endsWith(".sql"))
      .sort()

    let appliedCount = 0

    for (const file of migrationFiles) {
      if (appliedNames.has(file)) {
        continue
      }

      console.log(`[+] Applying migration: ${file}...`)
      const sqlContent = fs.readFileSync(path.join(migrationsDir, file), "utf-8")
      const statements = sqlContent.split("--> statement-breakpoint")

      for (const stmt of statements) {
        const trimmed = stmt.trim()
        if (!trimmed) continue

        try {
          await sql.unsafe(trimmed)
        } catch (err: any) {
          // Ignore duplicate object/relation/column errors (42P07, 42701, 42710, 42704)
          const ignorableCodes = ["42P07", "42701", "42710", "42704", "42P16"]
          if (
            ignorableCodes.includes(err.code) ||
            err.message?.includes("already exists") ||
            err.message?.includes("does not exist")
          ) {
            continue
          }
          throw err
        }
      }

      await sql`INSERT INTO "__drizzle_migrations" ("name") VALUES (${file}) ON CONFLICT ("name") DO NOTHING`

      console.log(`✅ Applied ${file}`)
      appliedCount++
    }

    if (appliedCount === 0) {
      console.log("✨ Database is already up to date. No pending migrations.")
    } else {
      console.log(`🎉 Successfully applied ${appliedCount} migration(s).`)
    }
  } catch (error) {
    console.error("❌ Migration failed:", error)
    process.exit(1)
  } finally {
    await sql.end()
  }
}

runMigration()
