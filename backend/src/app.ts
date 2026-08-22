import { configureOpenAPI } from "./lib/configure-open-api"
import { createApp } from "./lib/create-app"
import adminRoute from "./routes/admin.route"
import appsRoute from "./routes/apps.route"
import indexRoute from "./routes/index.route"
import leaderboardRoute from "./routes/leaderboard.route"
import matchesRoute from "./routes/matches.route"
import messagesRoute from "./routes/messages.route"
import notificationsRoute from "./routes/notifications.route"
import proofsRoute from "./routes/proofs.route"
import storageRoute from "./routes/storage.route"
import streamRoute from "./routes/stream"
import usersRoute from "./routes/users.route"
import { auth } from "./utils/auth"

const app = createApp()

configureOpenAPI(app)

// Auth Routes (Better Auth)
app.on(["POST", "GET"], "/api/auth/*", async (c) => await auth.handler(c.req.raw))

const appWithRoutes = app
  .route("/", indexRoute)
  .route("/", usersRoute)
  .route("/", appsRoute)
  .route("/", matchesRoute)
  .route("/", proofsRoute)
  .route("/", messagesRoute)
  .route("/", notificationsRoute)
  .route("/", storageRoute)
  .route("/", leaderboardRoute)
  .route("/", adminRoute)
  .route("/", streamRoute)

export type AppType = typeof appWithRoutes
export default app
