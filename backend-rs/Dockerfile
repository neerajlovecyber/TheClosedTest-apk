# ==============================================================================
# 1. Builder Stage
# ==============================================================================
FROM rust:1.85-alpine AS builder

WORKDIR /app

# Install build dependencies:
# - musl-dev, gcc, make: standard musl toolchain
# - perl: required by the `ring` crate (used by rustls/sqlx TLS)
# - openssl-dev, openssl-libs-static: needed by some TLS deps on musl
RUN apk add --no-cache musl-dev gcc make perl openssl-dev openssl-libs-static

# Copy dependency manifests for caching
COPY Cargo.toml Cargo.lock ./

# Pre-compile dependency cache
RUN mkdir src && \
    echo "fn main() {}" > src/main.rs && \
    cargo build --release && \
    rm -rf src

# Copy actual source code and migrations
COPY src ./src
COPY migrations ./migrations

# Build the release binary with full optimizations (opt-level = 3, lto = "fat")
RUN touch src/main.rs && cargo build --release

# ==============================================================================
# 2. Production Runtime Stage (Ultra-minimal Alpine container ~25MB)
# ==============================================================================
FROM alpine:3.21 AS runner

RUN apk add --no-cache ca-certificates tzdata

WORKDIR /app

# Run as non-root user for maximum security
RUN addgroup -S appgroup && adduser -S appuser -G appgroup
USER appuser

# Copy the compiled binary and migrations from builder
COPY --from=builder --chown=appuser:appgroup /app/target/release/backend-rs ./backend-rs
COPY --from=builder --chown=appuser:appgroup /app/migrations ./migrations

ENV PORT=9000
ENV NODE_ENV=production

EXPOSE 9000

CMD ["./backend-rs"]
