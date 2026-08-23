# AGENTS.md - Hono Bun Starter

Essential information for AI coding agents working in this repository.

## Tech Stack

- **Framework**: Hono v4.x
- **Runtime**: Bun v1.3.5
- **Language**: TypeScript v5.x (ESNext, ES modules)
- **Database**: Drizzle ORM with Neon PostgreSQL
- **Auth**: Clerk (token verification in `src/middlewares/auth.ts`)
- **Validation**: Zod v4.x

## Commands

### Development

- `bun run dev` - Start dev server with hot reload
- `bun start` - Start production server from dist/
- `bun run build` - Compile TypeScript to dist/
- `bun run type-check` - Type check without emitting

### Code Quality

- `bun run lint` - Run oxlint on src/
- `bun run lint:fix` - Auto-fix oxlint issues
- `bun run format` - Format with oxfmt
- `bun run format:check` - Check oxfmt formatting
- `bun run check` - Run oxlint + oxfmt --check
- `bun run check:fix` - Auto-fix lint, then format

### Database

- `bun run db:push` - Push schema changes directly
- `bun run db:generate` - Generate Drizzle migrations
- `bun run db:migrate` - Run database migrations
- `bun run db:studio` - Open Drizzle Studio

### Testing

Tests use Bun's built-in runner (`bun test`). Integration suites live in `src/routes/*.test.ts` and run against an in-memory PGlite database.

- `bun test` - Run all tests
- `bun test --watch` - Watch mode
- `bun test src/routes/backend.test.ts` - Run a single file

Fixture tokens (`test-clerk-*`) are only accepted when `NODE_ENV=test`; never add unguarded test-token shortcuts to auth middleware.

## Code Style

### TypeScript

- Strict mode enabled (tsconfig.json)
- ES modules (`"type": "module"` in package.json)
- Path mapping: `@/*` maps to `src/*`
- Target: ESNext

### Imports

- Prefer named imports for tree-shaking
- Group: external libs first, then local imports
- Use `@/` prefix for internal modules

```typescript
import { Hono } from "hono"
import { z } from "zod"

import { db } from "@/db"
import { getUsers } from "@/controllers/user"
```

### Naming

- **Variables/Functions**: camelCase (`getUsers`, `waitlistRoutes`)
- **Types/Classes**: PascalCase (`UserData`, `WaitlistController`)
- **Files**: kebab-case (`user-routes.ts`, `auth-utils.ts`)
- **Database**: snake_case (Drizzle convention)
- **Constants**: UPPER_SNAKE_CASE

### Formatting & Linting (OXC)

- No semicolons
- Double quotes
- 2-space indentation
- Trailing commas (all)
- LF line endings
- oxlint `correctness` category enabled; `eslint/eqeqeq`, `typescript/no-explicit-any`, `typescript/no-non-null-assertion` disabled
- oxfmt handles formatting (Prettier-compatible)

## Patterns

### Hono Routes

```typescript
import { Hono } from "hono"
import { zValidator } from "@hono/zod-validator"
import { z } from "zod"

const router = new Hono()

router.get("/", async (c) => {
  const result = await getData()
  return c.json(result)
})

router.post("/", zValidator("json", z.object({ email: z.string() })), async (c) => {
  const body = c.req.valid("json")
  const result = await createData(body)
  return c.json(result, 201)
})

export default router
```

### Controllers

```typescript
export async function getUsers() {
  try {
    const users = await db.select().from(userTable)
    return { success: true, data: users }
  } catch (error) {
    console.error("Error:", error)
    return { success: false, message: "Failed to fetch users" }
  }
}
```

### Database (Drizzle)

```typescript
export const user = pgTable("user", {
  id: text("id").primaryKey(),
  email: text("email").notNull().unique(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
})
```

### Auth (Clerk)

Protected routes use `authMiddleware` / `adminAuthMiddleware` from `src/middlewares/auth.ts`, which verifies Clerk session tokens (Backend SDK or remote JWKS) and auto-provisions the user row.

## Project Structure

```
src/
├── index.ts           # Server entry point
├── app.ts             # App creation, route mounting
├── routes/            # Hono route definitions + tests
├── db/                # Database schema & connection
├── middlewares/       # Auth middleware (Clerk)
└── utils/             # Helpers (datetime, cache)
```

## Environment Variables

- `PORT` - Server port (default: 9000)
- `DATABASE_URL` - Neon PostgreSQL connection string
- `CLERK_SECRET_KEY` / `CLERK_JWT_KEY` / `CLERK_PUBLISHABLE_KEY` - Clerk credentials

Copy `.env.example` to `.env` and fill in values.

## Git Hooks

- **Husky**: Pre-commit hooks configured
- **lint-staged**: Runs `oxlint --fix` + `oxfmt` on staged `*.{js,ts}` files

## CI/CD

GitHub Actions workflow (`.github/workflows/test.yml`):

- Runs on push/PR: `bun install` → `bunx tsc --noEmit` → oxlint/oxfmt → `bun test`

## Quick Start

1. `bun install`
2. `cp .env.example .env` and configure
3. `bun run dev`
4. Before committing: `bun run check:fix`

## Security Best Practices

- Use Zod for all input validation
- Use parameterized queries (Drizzle handles this)
- Validate environment variables
- Never log sensitive data
- Implement secure headers (already in index.ts)
