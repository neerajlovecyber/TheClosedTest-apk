import app from "./app"
import { env } from "./env"

export default {
  port: env.PORT,
  fetch: app.fetch,
}
