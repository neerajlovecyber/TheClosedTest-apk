
# 📱 UI Implementation Plan & App Structure

## 🧭 Navigation Architecture

### Main Tab Layout (Bottom Navigation)

#### 1. 🏠 Home Tab (`app/(tabs)/index.tsx`)
**Goal:** The central hub for "What do I need to do right now?"
*   **Header Section**:
    *   **User Stats**: Simple greeting + Current Reputation Score (prominent).
    *   **Streak Counter**: Days consistent.
*   **"Attention Needed" (Priority)**:
    *   Horizontal scroll list of Matches that need a proof upload **TODAY**.
    *   Cards show: App Icon, Partner Name, "Due in 4 hours".
*   **"My Apps Overview"**:
    *   Quick summary card for each of my apps (e.g., "Flappy Bird: 8/12 Testers").
*   **"Recent Activity"**:
    *   Notification feed summary (e.g., "User B joined your test", "Proof approved").

#### 2. 🛒 Marketplace Tab (`app/(tabs)/marketplace.tsx`)
**Goal:** Find apps to test and get testers.
*   **Top Bar (Filters)**:
    *   **"Recruiting"** (Default): Apps actively looking for testers.
    *   **"In Progress"**: Apps currently full/testing (for transparency).
*   **App List**:
    *   Cards displaying: App Icon, Name, "Need 5 Testers", "Offer to Swap" button.
    *   *Action*: Long-press to "Report App".
*   **Search**: Simple text search for app names.
*   **Action**: Tapping a card opens `AppDetailsModal`.

#### 3. 🧪 Tests Tab (`app/(tabs)/tests.tsx`)
**Goal:** Manage all active testing relationships.
*   **Segmented Control (Toggle)**:
    *   **"I'm Testing"**: Apps I am testing for others.
    *   **"My Apps"**: People testing my apps.
*   **List View**:
    *   **"I'm Testing"**: List of active matches. Status indicators (✅ Done Today, ⚠️ Upload Pending). Action: exact tap opens `MatchWorkArea`.
    *   **"My Apps"**: List of my own apps. Tap to view detailed Tester List for that app.
*   **Floating Action Button (FAB)**: "➕ Add New App" (Navigates to `AddApp` screen).

#### 4. 👤 Profile/Settings Tab (`app/(tabs)/settings.tsx`)
**Goal:** User identity settings and app config.
*   **Profile Header**: Avatar, Name, Email (Clerk).
*   **Trust Section**: "Google Group Joined" (Checkmark status).
*   **Reputation History**: Graph or list of recent point changes.
*   **App Settings**:
    *   Dark Mode Toggle.
    *   Notifications Settings.
    *   Help & Support / About Us.
    *   **Admin Dashboard** (Visible only if admin):
        *   View Reports.
        *   System Health & Analytics (DAU, Active Matches).
    *   Sign Out.

---

## 📚 Stack Screens (Full Screen Features)

These screens sit "on top" of the tabs.

#### A. ➕ Add App Screen (`app/add-app.tsx`)
*   **Form**:
    *   App Name.
    *   Icon Upload.
    *   Play Store Link.
    *   Required Testers (Slider 1-12).
    *   Instructions (Text Area + Quick Tags).
*   **Validation**: Start button disabled until valid.

#### B. 🤝 Match Work Area (`app/match/[matchId].tsx`)
*   **The most important screen for daily usage.**
*   **Header**: Partner Name, App Name, "Day 5 of 14".
*   **Tabs inside Screen**:
    *   **Chat (Default)**:
        *   Messenger-style interface.
        *   Text, Image, Video support.
        *   "System Messages" (e.g., "Please upload proof").
        *   *Retention*: "Messages older than 7 days are auto-deleted."
    *   **Progress**:
        *   14 Day Calendar Grid. Green ✅ for done, Red ❌ for missed.
    *   **Upload**:
        *   Big "Upload Proof" button.
        *   File picker (Image/Video).
*   **Context Menu**: "Report Problem", "Leave Test".

#### C. 📄 App Details (`app/app/[appId].tsx`)
*   Read-only view of an app from the marketplace.
*   "Join & Swap" Button: Opens a picker to select *your* app to trade.
