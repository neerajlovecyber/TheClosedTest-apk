# ⚡ TheClosedTest Backend API

High-performance, type-safe REST API powering **TheClosedTest** mobile client and administrator dashboard. Built with **Hono v4**, **Bun**, **Drizzle ORM**, and **PostgreSQL**.

---

## 🛠️ Architecture & Tech Stack

- **Web Framework**: [Hono v4](https://hono.dev/) with `@hono/zod-openapi`
- **Runtime & Bundler**: [Bun](https://bun.sh/) (v1.2+)
- **Database ORM**: [Drizzle ORM](https://orm.drizzle.team/)
- **Database Engine**: PostgreSQL 16+ (with `@electric-sql/pglite` in-memory fallback for lightning-fast testing)
- **Authentication**: [Clerk](https://clerk.com/) JWT & Session verification
- **Object Storage**: [Cloudflare R2](https://www.cloudflare.com/products/r2/) via S3 Presigned URLs
- **Push Notifications**: Expo Server SDK
- **API Documentation**: [Scalar](https://github.com/scalar/scalar) & OpenAPI (Swagger) v3.1

---

## 🚀 Getting Started

### 1. Prerequisites

- Install [Bun](https://bun.sh/): `curl -fsSL https://bun.sh/install | bash` (or via PowerShell on Windows: `powershell -c "irm bun.sh/install.ps1 | iex"`)

### 2. Install Dependencies

```bash
bun install
```

### 3. Configure Environment Variables

```bash
cp .env.example .env
```

Set the following variables in your `.env`:

```env
PORT=9000
NODE_ENV=development
DATABASE_URL=postgresql://user:password@localhost:5432/theclosedtest
CLERK_SECRET_KEY=sk_test_...
CLERK_PUBLISHABLE_KEY=pk_test_...
R2_ACCESS_KEY_ID=...
R2_SECRET_ACCESS_KEY=...
R2_ENDPOINT=https://<account-id>.r2.cloudflarestorage.com
R2_BUCKET_NAME=theclosedtest-proofs
```

### 4. Database Migrations

```bash
# Generate SQL migrations from schema
bun run db:generate

# Apply migrations to database
bun run db:migrate
```

### 5. Start Development Server

```bash
bun run dev
```

The server will start at `http://localhost:9000`.

---

## 📖 API Documentation

The backend includes dynamic OpenAPI documentation:

- **Interactive Scalar Docs**: [http://localhost:9000/reference](http://localhost:9000/reference)
- **OpenAPI JSON Spec**: [http://localhost:9000/doc](http://localhost:9000/doc)

---

## 🧪 Testing

The backend includes a comprehensive, automated test suite with in-memory PostgreSQL support (no external DB required to run tests):

```bash
# Run all unit and integration tests
bun test

# Watch mode
bun test:watch
```

---

## 📦 Production Build & Container

```bash
# Build standalone bundle
bun run build

# Start production server
bun start
```

### Docker Deployment

The backend includes an optimized multi-stage `Dockerfile`:

```bash
docker build -t theclosedtest-backend .
docker run -p 9000:9000 --env-file .env theclosedtest-backend
```

---

## 📜 License

This backend is licensed under the [Source-Available Community License](../LICENSE).
