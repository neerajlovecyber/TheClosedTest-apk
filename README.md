
# TheClosedTest 📱🤝

**The Mutual App Testing Platform for Android Developers**

> **Community-Sampled Testing**: I test your app, you test mine. Together we pass the 12 testers / 14 days requirement.

## 🚀 The Problem
To publish an Android app on the Google Play Store, developers with personal accounts must have **12 testers** opted-in for at least **14 consecutive days**. Finding 12 reliable people to do this for free is hard.

## 💡 The Solution
**TheClosedTest** connects developers in a 1-to-1 mutual exchange system. You promise to test another developer's app for 14 days, and in return, they test yours.

---

## 🛠️ How It Works

### 1. Setup & Configuration (CRITICAL) ⚠️
Before you can start, you **must** configure your Google Play Console to allow our community of testers:

1.  **Join the Google Group**: [theclosedtest@googlegroups.com](https://groups.google.com/g/theclosedtest)
    *   *You need to be a member of this group to download other people's apps.*
2.  **Add the Group to Your App**:
    *   Go to **Google Play Console** > **Closed Testing** > **Manage Track**.
    *   Select **Testers** > **Google Groups**.
    *   Add email: `theclosedtest@googlegroups.com`.
    *   *This gives permission to everyone in the group (us) to access your closed test.*

### 2. Add Your App
*   Submit your app details: Icon, Play Store Web Link, and Testing Instructions.
*   You can manage up to **3 apps** at a time.
*   Specify how many testers you still need (e.g., 0-12).

### 3. The Marketplace
*   Browse the **Marketplace** to find other apps looking for testers.
*   Send a **Join Request** to a developer. Use one of your apps as "collateral" for the swap.
*   Once accepted, a **Match** is created.

### 4. The 14-Day Cycle
*   **Daily Testing**: Launch your partner's app every day.
*   **Upload Proof**: Take a screenshot or screen recording of you using the app and upload it to the chat.
*   **Verify**: Review the proof your partner sends you. **Approve** it if it looks real, **Reject** if it's fake.
*   **Reputation**:
    *   **+1 Point**: For every approved daily upload.
    *   **Loss of Points**: For missing days or fake uploads.
    *   *Your Reputation Score determines your trustworthiness in the marketplace.*

### 5. Chat & Support
*   Use the built-in chat to report bugs to the developer or ask for help.
*   If a tester goes silent, you can "Leave Test" (affects reputation if unjustified).

---

## 🏗️ Technology Stack
*   **Frontend**: React Native (Expo)
*   **Backend & Database**: [Convex](https://convex.dev)
*   **Authentication**: [Clerk](https://clerk.com)
*   **Styling**: NativeWind (Tailwind CSS)

## 📦 Installation

```bash
# Install dependencies
bun install

# Run the development server
bun dev

# Start the Convex backend
bun convex dev
```

## 📜 License
MIT
