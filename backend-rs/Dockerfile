# ==============================================================================
# 1. Builder Stage (Debian-based to avoid musl/ring/nasm compilation issues)
# ==============================================================================
FROM rust:1.94-bookworm AS builder

WORKDIR /app

# Install build dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    pkg-config \
    libssl-dev \
    && rm -rf /var/lib/apt/lists/*

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

# Build the release binary
RUN touch src/main.rs && cargo build --release

# ==============================================================================
# 2. Production Runtime Stage
# ==============================================================================
FROM debian:bookworm-slim AS runner

RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates \
    tzdata \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Run as non-root user for security
RUN groupadd -r appgroup && useradd -r -g appgroup appuser
USER appuser

# Copy the compiled binary and migrations from builder
COPY --from=builder --chown=appuser:appgroup /app/target/release/backend-rs ./backend-rs
COPY --from=builder --chown=appuser:appgroup /app/migrations ./migrations

ENV PORT=9000
ENV NODE_ENV=production

EXPOSE 9000

CMD ["./backend-rs"]
