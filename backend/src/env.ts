import { z } from "zod"

const rawDbUrl =
  process.env.DATABASE_URL ||
  process.env.NF_TESTERDB_POSTGRES_URI ||
  process.env.NF_TESTERDB_EXTERNAL_POSTGRES_URI ||
  "postgresql://_3c65fa5a9abf5de8:_2b6d3daa8a5ce112e4e50b8f4d6774@primary.testerdb--7tlh8kl746cq.addon.code.run:29777/_21052a96657c?sslmode=require"

const EnvSchema = z.object({
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  PORT: z.coerce.number().default(9000),
  LOG_LEVEL: z
    .enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"])
    .default("info"),
  DATABASE_URL: z.string().min(1).default(rawDbUrl),
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
  process.env.DATABASE_URL = parsed.data.DATABASE_URL

  return parsed.data
}

export const env = parseEnv()
