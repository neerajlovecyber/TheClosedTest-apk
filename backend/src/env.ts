import { z } from "zod"

const EnvSchema = z.object({
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  PORT: z.coerce.number().default(9000),
  LOG_LEVEL: z
    .enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"])
    .default("info"),
  DATABASE_URL: z
    .string()
    .min(1)
    .default("postgresql://postgres:postgres@localhost:5432/closedtest"),
  BETTER_AUTH_SECRET: z
    .string()
    .default("dev-secret-change-me-in-production-1234567890abcdef"),
  BETTER_AUTH_URL: z.string().default("http://localhost:9000"),
  EXPO_ACCESS_TOKEN: z.string().optional(),
  CLOUDFLARE_R2_ACCOUNT_ID: z.string().optional(),
  CLOUDFLARE_R2_ACCESS_KEY_ID: z.string().optional(),
  CLOUDFLARE_R2_SECRET_ACCESS_KEY: z.string().optional(),
  CLOUDFLARE_R2_BUCKET_NAME: z.string().optional(),
  CLOUDFLARE_R2_PUBLIC_URL: z.string().optional(),
})

export type Env = z.infer<typeof EnvSchema>

function parseEnv(): Env {
  const parsed = EnvSchema.safeParse(process.env)

  if (!parsed.success) {
    console.error("❌ Invalid environment variables:", parsed.error.flatten().fieldErrors)
    throw new Error("Invalid environment variables")
  }

  // Ensure process.env has these values for libraries that inspect process.env directly
  process.env.BETTER_AUTH_SECRET = parsed.data.BETTER_AUTH_SECRET
  process.env.BETTER_AUTH_URL = parsed.data.BETTER_AUTH_URL

  return parsed.data
}

export const env = parseEnv()
