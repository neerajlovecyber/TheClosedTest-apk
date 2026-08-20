import app from "./app"
import { env } from "./env"
import { startBackgroundJobs } from "./jobs/cron-runner"

// Start background cron jobs on container boot
startBackgroundJobs()

export default {
  port: env.PORT,
  fetch: app.fetch,
}
