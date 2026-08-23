# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
bun run dev          # Dev server with hot reload (port 9000)
bun run build        # Compile to dist/ via Bun bundler
bun start            # Run production build from dist/
bun run type-check   # TypeScript type checking only

bun run lint         # oxlint on src/
bun run lint:fix     # Auto-fix lint issues
bun run format       # oxfmt formatting
bun run format:check # Check formatting
bun run check        # oxlint + oxfmt --check
bun run check:fix    # Auto-fix lint, then format

bun run db:push      # Push schema changes to database
bun run db:generate  # Generate Drizzle migrations
bun run db:migrate   # Run migrations
bun run db:studio    # Visual database editor
```

Tests use Bun's built-in runner: `bun test` (suites live in `src/routes/*.test.ts`).

## Architecture

Hono web framework running on Bun with Drizzle ORM (Neon PostgreSQL) and Clerk authentication.

**Entry point**: `src/index.ts` — sets up middleware (logger, secureHeaders) and mounts route modules.

**Layers**:

- `src/routes/` — Hono routers with Zod validation via `@hono/zod-validator`. Each file exports a `Hono()` instance mounted in app.ts.
- `src/controllers/` — Business logic functions that interact with the database and return `{ success, data/message }` objects.
- `src/db/schema.ts` — Drizzle table definitions. Relations defined here too.
- `src/db/index.ts` — Drizzle client instance using Neon serverless driver.
- `src/middlewares/auth.ts` — Clerk token verification (Backend SDK + remote JWKS via jose), user auto-provisioning, and admin guard.
- `src/utils/datetime.ts` — date-fns formatting helpers.

## Code Style

- **No semicolons**, double quotes, 2-space indent (oxfmt)
- Path alias: `@/*` maps to `src/*`
- oxlint handles linting via `.oxlintrc.json`; oxfmt handles formatting via `.oxfmtrc.json`
- `eslint/eqeqeq`, `typescript/no-explicit-any`, and `typescript/no-non-null-assertion` are intentionally disabled
- Pre-commit hook (Husky + lint-staged) runs `oxlint --fix` + `oxfmt` on staged `*.{js,ts}` files

## Patterns

Routes create a `new Hono()`, define handlers, and `export default router`. POST routes use `zValidator("json", schema)` middleware for request validation. Controllers use try-catch and return result objects rather than throwing. Database access uses Drizzle's query builder (`db.select().from(table)`).

## Environment

Copy `.env.example` to `.env`. Key variables: `DATABASE_URL` (Neon PostgreSQL), Clerk keys (`CLERK_SECRET_KEY`, `CLERK_JWT_KEY`, `CLERK_PUBLISHABLE_KEY`).
