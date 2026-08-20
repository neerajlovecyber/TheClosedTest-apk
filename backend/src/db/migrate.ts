import fs from "node:fs"
import path from "node:path"
import postgres from "postgres"

import { env } from "../env"

async function runMigration() {
  console.log("Connecting to database...")
  const sql = postgres(env.DATABASE_URL, {
    ssl: env.DATABASE_URL.includes("sslmode=require") ? "require" : undefined,
  })

  try {
    console.log("Cleaning up old starter tables...")
    await sql.unsafe(`
      DROP TABLE IF EXISTS "verification" CASCADE;
      DROP TABLE IF EXISTS "account" CASCADE;
      DROP TABLE IF EXISTS "session" CASCADE;
      DROP TABLE IF EXISTS "waitlist" CASCADE;
      DROP TABLE IF EXISTS "user" CASCADE;
      DROP TABLE IF EXISTS "users" CASCADE;
      DROP TABLE IF EXISTS "admin_messages" CASCADE;
      DROP TABLE IF EXISTS "admin_chats" CASCADE;
      DROP TABLE IF EXISTS "analytics" CASCADE;
      DROP TABLE IF EXISTS "app_bans" CASCADE;
      DROP TABLE IF EXISTS "apps" CASCADE;
      DROP TABLE IF EXISTS "boost_cycles" CASCADE;
      DROP TABLE IF EXISTS "boost_leaderboard" CASCADE;
      DROP TABLE IF EXISTS "daily_activity" CASCADE;
      DROP TABLE IF EXISTS "matches" CASCADE;
      DROP TABLE IF EXISTS "messages" CASCADE;
      DROP TABLE IF EXISTS "notifications" CASCADE;
      DROP TABLE IF EXISTS "proofs" CASCADE;
      DROP TABLE IF EXISTS "reports" CASCADE;
      DROP TABLE IF EXISTS "user_bans" CASCADE;
      DROP TABLE IF EXISTS "user_warnings" CASCADE;
      DROP SCHEMA IF EXISTS "drizzle" CASCADE;
    `)

    const sqlPath = path.resolve(import.meta.dirname, "./migrations/0000_initial_schema.sql")
    const sqlContent = fs.readFileSync(sqlPath, "utf-8")

    console.log("Applying initial schema SQL...")
    await sql.unsafe(sqlContent)
    console.log("✅ Schema migration executed successfully!")
  } catch (error) {
    console.error("❌ Migration error:", error)
    process.exit(1)
  } finally {
    await sql.end()
  }
}

runMigration()
