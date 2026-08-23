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
import usersRoute from "./routes/users.route"

const app = createApp()

configureOpenAPI(app)

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

export type AppType = typeof appWithRoutes
export default app
