# 🚀 The Closed Test - Implementation Checklist

## 1. Project Initialization & Configuration
- [x] **Project Setup**: Initialize Expo project with TypeScript.
- [x] **Styling Engine**: Configure NativeWind (Tailwind CSS) with custom theme colors (`primary`, `secondary`, `destructive`, etc.).
- [x] **Fonts**: Setup custom fonts (Inter/Geist) if applicable (using system fonts currently).
- [x] **Navigation**: Configure Expo Router with File-based routing.
    - [x] Data-driven Tab Bar (`app/(tabs)/_layout.tsx`).
    - [x] Stack navigation for details and auth screens.

## 2. Authentication & Onboarding
- [x] **Clerk Integration**: Setup Clerk Provider in Root Layout.
- [x] **Auth Screens**:
    - [x] Welcome / Landing Page.
    - [x] Sign Up & Sign In Forms.
    - [x] Password Reset Views.
- [x] **Onboarding Flow**:
    - [x] "Welcome" screen for new users.
    - [x] Post-login redirect logic (Fix: Prevent onboarding flash for returning users).

## 3. Core UI Components (Design System)
- [x] **Base Components** (`components/ui`):
    - [x] `Text` (Themed typography).
    - [x] `Button` (Variants: default, destructive, outline, ghost).
    - [x] `Card` (Container styling).
    - [x] `Input` & `Textarea`.
    - [x] `Icon` (Lucide React Native integration).
- [x] **Complex Components**:
    - [x] `AppCard`: Versatile card for Marketplace, My Apps, and Testing tasks.
        - [x] Context-aware rendering (Status badges, Progress bars).
        - [x] Conditional Navigation (Fix: Prevent crashes on undefined `onPress`).

## 4. Feature Implementation

### A. Home Dashboard (`app/(tabs)/index.tsx`)
- [x] **Header**: User greeting, Notification bell.
- [x] **Stats Overview**: Reputation score, Streak counter cards.
- [x] **Attention Needed**: Horizontal scroll of urgent tasks (e.g., "Due Today").
- [x] **My Apps Section**:
    - [x] List of user's own apps seeking testers.
    - [x] **"New App" Action**: Button to navigate to Add App screen.

### B. Marketplace (`app/(tabs)/marketplace.tsx`)
- [x] **Search**: Real-time filtering by app name.
- [x] **"Latest Opportunities"**: Horizontal scrollable list (grid-like columns) for new recruiting apps.
- [x] **"All Apps"**: Vertical list combining "Recruiting" and "Filled" apps.
- [x] **Data Integration (Convex)**:
    - [x] `getMarketplaceApps` query integration.
    - [x] Fallback to dummy data for UI development.

### C. My Tasks / Tests (`app/(tabs)/tests.tsx`)
- [x] **Refactor**: Removed "My Apps" management from this screen.
- [x] **Task Grouping**: `SectionList` grouping tasks by the "Related My App" (the app earning credits).
- [x] **Status**: Visual indicators for "Pending", "Completed", "Due Today".

### D. Settings (`app/(tabs)/settings.tsx`)
- [x] **Profile Card**: Avatar, Name, Email, "Google Group Member" badge.
- [x] **Preferences**: Dark Mode toggle (NativeWind integration).
- [x] **Static Pages**:
    - [x] About Us screen.
    - [x] Privacy Policy screen.
- [x] **Logout**: Functional sign-out button.

### E. App submission (`app/add-app.tsx`)
- [x] **Form UI**: Fields for Title, Link, Instructions, Tester Count.
- [x] **Image Picker**: Integration with `expo-image-picker` (Mock upload simulation).
- [x] **Validation**: Basic form validation logic.
- [x] **Submission**: Connects to `createApp` mutation.

### F. App Details (`app/app-details/[id].tsx`)
- [x] **Info Display**: App Icon, Description, Instructions.
- [x] **Progress**: Visual progress bar of current/required testers.
- [x] **Actions**: "Request Swap" button placeholder.

## 5. Backend Logic (Convex)
- [x] **Schema Definition**: Users, Apps tables.
- [x] **Mutations**:
    - [x] `createUser`: Store user data on auth.
    - [x] `createApp`: Create new app entry.
- [x] **Queries**:
    - [x] `getMarketplaceApps`: Filter and sorting logic.

## 6. Pending / Future Improvements (Priority)
### A. Testing & Verification Logic
- [ ] **Matches Schema**: Define `matches` table in `convex/schema.ts` (1-on-1 relationship).
- [ ] **Swap Logic**:
    - [ ] `requestSwap` mutation (create pending match).
    - [ ] `acceptSwap` mutation (update match to active).
- [ ] **Proof System**:
    - [ ] `proofs` table schema (matchId, day, imageStorageId).
    - [ ] UI for uploading proof (Image picker).
    - [ ] UI for reviewing proof (Approve/Reject).

### B. "Manage My App" (Owner Dashboard)
- [ ] **Owner View**: Screen to see list of active testers for a specific app.
- [ ] **Tester Management**: View status of each tester (e.g., "Day 5/14", "Missed Yesterday").

### C. The "Work Area" (Match Details)
- [ ] **Chat**: Real-time chat integration for each match.
- [ ] **14-Day Grid**: Visual calendar of daily progress.

### D. Notifications & Automation
- [ ] **Push Notifications**: Expo Notifications setup.
- [ ] **Cron Jobs**: Daily check for missed proofs / reminders.
