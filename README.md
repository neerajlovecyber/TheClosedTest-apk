<div align="center">

<img src="./assets/images/logo.svg" alt="TheClosedTest Logo" width="110" height="110" />

# TheClosedTest

### _The Open-Source Community Platform for Google Play 14-Day Closed Testing_

[![License: Source-Available](https://img.shields.io/badge/License-Source--Available-blue.svg)](./LICENSE)
[![React Native](https://img.shields.io/badge/React_Native-0.86-61DAFB?logo=react&logoColor=black)](https://reactnative.dev/)
[![Expo](https://img.shields.io/badge/Expo_SDK-57-000020?logo=expo&logoColor=white)](https://expo.dev/)
[![React](https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=black)](https://react.dev/)
[![Hono](https://img.shields.io/badge/Hono-v4-E36002?logo=hono&logoColor=white)](https://hono.dev/)
[![Drizzle ORM](https://img.shields.io/badge/Drizzle_ORM-PostgreSQL-C5F74F?logo=postgresql&logoColor=black)](https://orm.drizzle.team/)
[![Bun](https://img.shields.io/badge/Bun-1.1+-fbf0df?logo=bun&logoColor=black)](https://bun.sh/)
[![Cloudflare R2](https://img.shields.io/badge/Storage-Cloudflare_R2-F38020?logo=cloudflare&logoColor=white)](https://www.cloudflare.com/products/r2/)

<p align="center">
  <b>Connect with fellow Android developers to ethically test each other's apps and pass Google Play's 14-day 12-tester requirement together.</b>
</p>

</div>

---

## 🌟 Overview

Google Play Console requires personal developer accounts to run a **14-day closed test with at least 12 continuous testers** before requesting production access. Finding genuine, daily testers is difficult for solo indie developers and small startups.

**TheClosedTest** solves this problem through an ethical, community-driven **peer testing exchange**:

- 🤝 **Reciprocal Testing Swaps**: "I test your app for 14 days, you test mine."
- 📸 **Daily Proof Verification**: Upload screenshot proofs daily to verify genuine testing engagement.
- 💬 **In-Match Developer Chat**: Real-time communication and direct feedback sharing between testing partners.
- 🛡️ **Strict Community Quality**: Built-in reputation system, dispute resolution, and zero tolerance for bots or artificial activity.

---

## ✨ Key Features

- **App Marketplace**: Discover Android apps seeking closed testers, filter by category, and request testing swaps.
- **Mutual Swap Protocol**: Lock-in 1-to-1 testing agreements with paired Android apps.
- **14-Day Daily Proof Tracker**: Daily screenshot uploader with automatic image compression (WebP) and Cloudflare R2 storage.
- **Partner Review & Approval**: App owners inspect daily screenshots and approve or request re-upload.
- **In-App Messaging**: Instant chat with your testing partner to share crash logs, suggestions, and feedback.
- **Push Notifications**: Real-time Expo Push notifications when swap requests arrive, proofs are uploaded, or reviews are completed.
- **Community Moderation**: Report non-responsive testers, spam, or malicious APKs directly to administrators.
- **Admin Dashboard**: Comprehensive admin suite for user moderation, match oversight, and system analytics.

---

## 🛠️ Architecture & Tech Stack

```
TheClosedTest-apk/
├── app/                  # Expo Router (Tabs, App Details, Notifications, Modals)
├── components/           # Reusable UI & Shadcn-style React Native components
├── hooks/                # Custom React hooks (Notifications, Theming, Cache)
├── lib/                  # TanStack Query hooks, Hono API client, Theme tokens
├── backend/              # Hono REST API + OpenAPI (Swagger) backend
│   ├── src/db/           # Drizzle ORM Schema & PostgreSQL migrations
│   ├── src/routes/       # Modular REST endpoints (Apps, Matches, Proofs, etc.)
│   ├── src/services/     # Cloudflare R2 & Expo Push Notification services
│   └── src/middlewares/  # Clerk JWT authentication & validation
└── utils/                # Image manipulation, storage uploaders, date helpers
```

### Frontend Mobile App

- **Framework**: [Expo SDK 57](https://expo.dev/) + [React Native 0.86](https://reactnative.dev/) (React 19)
- **Routing**: [Expo Router v57](https://docs.expo.dev/router/introduction/) (File-based navigation)
- **Styling**: [NativeWind v4](https://www.nativewind.dev/) (Tailwind CSS for React Native)
- **State Management & Caching**: [TanStack React Query v5](https://tanstack.com/query/latest)
- **Authentication**: [Clerk Expo SDK](https://clerk.com/)

### Backend REST API

- **Runtime**: [Bun](https://bun.sh/)
- **Framework**: [Hono v4](https://hono.dev/) with `@hono/zod-openapi` & Swagger Documentation
- **Database**: [PostgreSQL](https://www.postgresql.org/) (Neon / Supabase / Self-hosted)
- **ORM**: [Drizzle ORM](https://orm.drizzle.team/)
- **Media Storage**: [Cloudflare R2](https://www.cloudflare.com/products/r2/) via S3-compatible SDK
- **Push Notifications**: Expo Server SDK

---

## 📡 Live API & Interactive Documentation

The backend includes interactive Scalar API documentation and a public health check probe:

| Resource                                   | URL                                                                      | Description                                                            |
| :----------------------------------------- | :----------------------------------------------------------------------- | :--------------------------------------------------------------------- |
| **Interactive API Playground (Scalar UI)** | [**`/reference`**](https://p01--tester--7tlh8kl746cq.code.run/reference) | Interactive OpenAPI explorer to inspect and test all backend endpoints |
| **Health Check Probe**                     | [**`/`**](https://p01--tester--7tlh8kl746cq.code.run/)                   | Live server status & health check                                      |

---

## 🚀 Quick Start

### Prerequisites

- [Bun](https://bun.sh/) (v1.1+) or Node.js (v20+)
- [PostgreSQL](https://www.postgresql.org/) database (local instance or cloud database like Neon)
- [Expo Go](https://expo.dev/go) on your Android device or an Android Studio emulator

---

### 1. Clone the Repository

```bash
git clone https://github.com/neerajlovecyber/TheClosedTest-apk.git
cd TheClosedTest-apk
```

---

### 2. Backend Setup

```bash
cd backend

# Install dependencies
bun install

# Create your environment file
cp .env.example .env
```

Configure your `backend/.env`:

```env
PORT=3000
NODE_ENV=development
DATABASE_URL=postgresql://user:password@localhost:5432/theclosedtest
CLERK_SECRET_KEY=sk_test_...
CLERK_PUBLISHABLE_KEY=pk_test_...
R2_ACCOUNT_ID=...
R2_ACCESS_KEY_ID=...
R2_SECRET_ACCESS_KEY=...
R2_BUCKET_NAME=theclosedtest-proofs
R2_PUBLIC_DOMAIN=https://your-r2-worker.workers.dev
```

Run database migrations & start the API server:

```bash
# Push database schema
bun run db:push

# Start backend dev server
bun run dev
```

> **API Documentation**: Open `http://localhost:3000/reference` in your browser for the interactive OpenAPI / Scalar API documentation.

---

### 3. Mobile Frontend Setup

```bash
# From the project root
bun install

# Create environment file
cp .env.example .env
```

Configure your root `.env`:

```env
EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_test_...
EXPO_PUBLIC_API_URL=http://<YOUR_LOCAL_IP>:3000
EXPO_PUBLIC_R2_WORKER_URL=https://your-r2-worker.workers.dev
```

Start the Expo development server:

```bash
bun start
```

Press `a` to open on Android Emulator, or scan the QR code with **Expo Go** on your physical Android device.

---

## 🧪 Testing & Code Quality

```bash
# Run frontend TypeScript checks
bun x tsc --noEmit

# Run backend unit & integration tests
cd backend
bun test
```

---

## 🛡️ Policy Compliance & Ethics

TheClosedTest strictly adheres to Google Play policies:

- ❌ **No Automated Bots**: No bot farms, automated scripts, or artificial installs.
- ❌ **No Paid Reviews**: Users are not compensated with real money for positive reviews.
- ✅ **Genuine Peer Testing**: Real developers testing real applications, providing constructive bug reports and stability feedback.

---

## 🤝 Contributing

Contributions, bug reports, and pull requests are warmly welcomed! Please read our [Contributing Guidelines](CONTRIBUTING.md) for details on setting up your local development environment and our code contribution process.

---

## 🔒 Security

If you discover a potential vulnerability, please review our [Security Policy](SECURITY.md) to report it responsibly.

---

## 📄 License

This project is licensed under the **Source-Available Community License** — see the [LICENSE](LICENSE) file for terms and restrictions.

_You are permitted to view the source code, build and test locally, and submit contributions/PRs. Sublicensing, re-branding, publishing clones/forks to app stores (Google Play / App Store), or running a competing hosted service is strictly prohibited._

---

<div align="center">
  <sub>Built with ❤️ for the Android Indie Developer Community.</sub>
</div>
