import { configureOpenAPI } from "./lib/configure-open-api"
import { createApp } from "./lib/create-app"
import indexRoute from "./routes/index.route"
import streamRoute from "./routes/stream"
import userRoutes from "./routes/user"
import waitlistRoutes from "./routes/waitlist"
import { auth } from "./utils/auth"

const app = createApp()

configureOpenAPI(app)

// Auth Routes (Better Auth)
app.on(
  ["POST", "GET"],
  "/api/auth/*",
  async (c) => await auth.handler(c.req.raw),
)

// API routes
const routes = [
  indexRoute,
  userRoutes,
  waitlistRoutes,
  streamRoute,
] as const

routes.forEach((route) => {
  app.route("/", route)
})

export type AppType = typeof routes[number]
export default app
