# Multi-stage Dockerfile using latest oven/bun:alpine
FROM oven/bun:alpine AS builder

WORKDIR /app

# Copy dependency manifests
COPY package.json bun.lock* ./

# Install dependencies (ignoring husky scripts in container)
RUN bun install --frozen-lockfile --ignore-scripts

# Copy source code
COPY . .

# Build production bundle
RUN bun run build

# ----------------------------------------------------
# Production Runner Image
FROM oven/bun:alpine AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=9000

# Copy only production bundle and database migrations
COPY --from=builder /app/package.json ./
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/src/db/migrations ./src/db/migrations

EXPOSE 9000

# Run as non-root user for security
USER bun

CMD ["bun", "dist/index.js"]
