/**
 * Admin & Support routes — aggregated from focused sub-routers.
 * Route definitions live in ./admin/ (moderation, overview, support, apps-admin).
 */
import { createRouter } from "../lib/create-app"

import adminAppsRouter from "./admin/apps-admin"
import adminModerationRouter from "./admin/moderation"
import adminOverviewRouter from "./admin/overview"
import adminSupportRouter from "./admin/support"

const router = createRouter()
  .route("/", adminModerationRouter)
  .route("/", adminOverviewRouter)
  .route("/", adminSupportRouter)
  .route("/", adminAppsRouter)

export default router
