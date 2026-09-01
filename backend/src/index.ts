import app from "./app"
import { closeDatabase } from "./db"
import { env } from "./env"
import { startBackgroundJobs, stopCronJobs } from "./jobs/cron-runner"

// Start background cron jobs on container boot
startBackgroundJobs()

const server = Bun.serve({
  port: env.PORT,
  fetch: app.fetch,
})

console.log(`🚀 TheClosedTest server listening on port ${env.PORT}`)

let isShuttingDown = false

async function gracefulShutdown(signal: string) {
  if (isShuttingDown) return
  isShuttingDown = true

  console.log(`\n🛑 Received ${signal}. Initiating graceful shutdown...`)

  try {
    // 1. Stop background jobs to release locks & stop scheduled tasks
    stopCronJobs()

    // 2. Stop accepting new connections
    server.stop(true)

    // 3. Gracefully close DB pool (waits up to 5s for pending queries)
    await closeDatabase()

    console.log("✅ Graceful shutdown completed cleanly. Exiting.")
    process.exit(0)
  } catch (error) {
    console.error("❌ Error during graceful shutdown:", error)
    process.exit(1)
  }
}

process.on("SIGTERM", () => gracefulShutdown("SIGTERM"))
process.on("SIGINT", () => gracefulShutdown("SIGINT"))

export default server
