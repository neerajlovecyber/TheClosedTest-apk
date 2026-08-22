# Contributing to TheClosedTest 🤝

Thank you for your interest in contributing to **TheClosedTest**! We welcome community contributions, bug fixes, and feature improvements.

---

## 🛠️ Development Setup

### Prerequisites

- [Bun](https://bun.sh/) (v1.2+)
- [Node.js](https://nodejs.org/) (v20+)
- [Expo CLI](https://docs.expo.dev/)

### 1. Clone the Repository

```bash
git clone https://github.com/your-username/TheClosedTest-apk.git
cd TheClosedTest-apk
```

### 2. Frontend Setup (Mobile App)

```bash
# Install dependencies
bun install

# Start the Expo development server
bun start
```

### 3. Backend Setup (REST API & DB)

```bash
cd backend

# Install backend dependencies
bun install

# Copy environment variables
cp .env.example .env

# Run full test suite (Uses fast, zero-dependency in-memory Postgres)
bun test

# Start the backend development server
bun run dev
```

---

## 🧪 Testing Guidelines

Before submitting any Pull Request:

1. Ensure all backend unit tests pass:
   ```bash
   cd backend
   bun test
   ```
2. Verify production bundle build succeeds:
   ```bash
   cd backend
   bun run build
   ```
3. Test your mobile UI changes with Expo in dark/light mode across screen sizes.

---

## 🚀 Submitting a Pull Request (PR)

1. **Fork the repository** to your GitHub account.
2. **Create a feature branch**:
   ```bash
   git checkout -b fix/issue-description
   ```
3. **Commit your changes** with clear, descriptive commit messages:
   ```bash
   git commit -m "fix: resolve message bubble alignment in support chat"
   ```
4. **Push to your fork**:
   ```bash
   git push origin fix/issue-description
   ```
5. **Open a Pull Request** against the `master` branch.
   - Describe what the PR accomplishes.
   - Mention any related GitHub issues.
   - Include screenshots or screen recordings for UI changes.

---

## 📜 License

By contributing to TheClosedTest, you agree that your contributions will be licensed under the project's [Source-Available Community License](./LICENSE).
