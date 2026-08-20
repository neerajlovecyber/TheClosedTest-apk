# TheClosedTest: Convex to PostgreSQL & Hono Migration Guide

This guide details the architectural transition from Convex (serverless reactive BaaS) to a self-hosted, high-performance PostgreSQL backend using **Hono**, **Drizzle ORM**, **Aiven PostgreSQL**, and **Cloudflare R2**.

---

## 1. Architecture Overview

```
┌────────────────────────────────────────────────────────┐
│             React Native / Expo Mobile App             │
└───────────────────────────┬────────────────────────────┘
                            │  Hono RPC / OpenAPI Client
                            ▼
┌────────────────────────────────────────────────────────┐
│             Hono + Bun Backend API Server              │
│  - OpenAPI & Zod Validation (hono/zod-openapi)         │
│  - Structured Logging (Pino / hono-pino)               │
│  - Better Auth / Clerk Session Verification            │
└───────┬───────────────────┬───────────────────┬────────┘
        │                   │                   │
        ▼                   ▼                   ▼
┌──────────────┐    ┌──────────────┐    ┌──────────────┐
│  PostgreSQL  │    │  Cloudflare  │    │  Expo Push   │
│   (Aiven)    │    │      R2      │    │   Service    │
│  Drizzle ORM │    │ (Media/Proof)│    │(Notifications│
└──────────────┘    └──────────────┘    └──────────────┘
```

---

## 2. Entity Mapping: Convex $\rightarrow$ PostgreSQL (Drizzle)

| Convex Table | PostgreSQL Table (Drizzle) | Description |
| :--- | :--- | :--- |
| `users` | `users` | User accounts, reputation, streaks, push tokens, admin role |
| `apps` | `apps` | Android apps in closed testing, package names, tester requirements |
| `matches` | `matches` | 14-day peer-to-peer testing pairings between two developers |
| `proofs` | `proofs` | Daily testing screenshot/video proofs submitted by testers |
| `messages` | `messages` | Direct chat messages within a match |
| `notifications`| `notifications` | In-app notification inbox and push alerts |
| `reports` | `reports` | Dispute reports, broken apps, moderation tickets |
| `user_bans` | `user_bans` | Permanent/temporary user bans |
| `app_bans` | `app_bans` | Package name blacklists |
| `user_warnings`| `user_warnings`| Warning notices sent to users |
| `admin_chats` | `admin_chats` | Direct support chats between users and admins |
| `admin_messages`| `admin_messages`| Messages within admin support chats |
| `boost_leaderboard` | `boost_leaderboard` | Real-time boost ranking |
| `boost_cycles` | `boost_cycles` | 48-hour boost cycle timestamps |
| `daily_activity` | `daily_activity` | Daily user engagement for DAU analytics |
| `analytics` | `analytics` | Aggregated daily metrics |

---

## 3. Migration Milestones

### Milestone 1: Backend Foundation (Active)
- Set up Hono + OpenAPI + Drizzle + Vitest in `backend/`
- Connect and test Aiven PostgreSQL database connection
- Implement complete Drizzle schema with typed relations and indexes
- Implement domain routes (Users, Apps, Matches, Proofs, Messages, Notifications, Admin)
- Implement background cron workers for streaks and match timeouts
- Add automated Vitest integration test suites

### Milestone 2: Cloudflare R2 Media Storage
- Implement presigned upload URLs in `POST /api/storage/presigned-url`
- Allow mobile client to directly upload screenshots and videos to Cloudflare R2
- Store public/CDN media URLs in the `proofs` and `messages` tables

### Milestone 3: Client SDK & Mobile App Switchover
- Create Hono RPC client in the mobile app (`lib/api.ts`)
- Replace Convex hooks (`useQuery`, `useMutation`) with TanStack Query (React Query) + Hono RPC
- Verify full 14-day testing flow, matchmaking, chat, and proof submissions
