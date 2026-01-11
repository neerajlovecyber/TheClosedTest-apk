
# TheClosedTest - Implementation Plan

## 1. Project Overview
**TheClosedTest** is a mutual app testing platform designed to help Android developers meet the Google Play Store's requirement of **12 testers for 14 continuous days**. Developers test each other's apps in a 1-to-1 exchange system, ensuring genuine engagement and verified testing.

## 2. Core Workflows

### A. App Submission
- **Limit**: Max 3 active apps per user.
- **Required Data**:
  - App Name
  - App Icon
  - Google Play Console Link (Web or App link)
  - Number of Testers Required (e.g., "Need 5 more")
  - Testing Instructions (Specific actions to perform)
    - *Quick Suggestions*: "Open app daily", "Keep installed for 14 days", "Test for 5 mins".
- **Critical Requirement**:
  - User MUST confirm they have added `developers-community-official@googlegroups.com` to their Closed Testing track.
  - User MUST confirmed they have joined the Google Group (persisted in profile).

### B. Marketplace & Matching
- **Marketplace View**:
  - **Recruiting**: Vertical list of apps actively looking for testers.
  - **In Progress**: Separate section showing apps that are currently full/filled but undergoing testing.
  - Filters: "Needs Testers", "Newest", "In Progress".
- **Interaction**:
  - **Listing**: User A has an app (App A) listed in the Marketplace.
  - **Request**: User B finds App A and sends a **"Swap Request"** to User A.
  - **Offer**: User B **must** select one of their own active apps (App B) to offer in exchange.
- **Matching**:
  - User A receives the request showing App B details.
  - User A accepts the request.
  - **Match Created**: User A tests App B <--> User B tests App A.

### C. The Daily Testing Cycle (14 Days)
- **Goal**: Both users must engage with the app daily for 14 days.
- **Daily Task**:
  - Open App.
  - Perform simple interaction.
  - **Upload Proof**: Screenshot or Screen Recording.
- **Verification**:
  - Opposing user sees the proof.
  - Action: **Approve** (Valid test) or **Reject** (Fake/Low effort).
  - **Reputation Impact**:
    - **Approved**: +1 Reputation Point.
    - **Rejected/Missed**: -1 Reputation Points.
- **Visualization**:
  - A 14-day grid/calendar view showing status (✅ Uploaded, ⏳ Pending Review, ❌ Missed/Rejected) for both parties.

### D. Communication
- **Chat**: Built-in 1-on-1 chat for every active Match.
- **Use Cases**: Discussing bugs, clarifying instructions, nudging for daily uploads.

### E. Gamification & Trust
- **Reputation Score**: Visible on User Profile. High score = Reliable Tester.
- **Leave Test**: Option to abort a test (penalizes reputation if done early without cause).

### F. Notifications
- **Triggers**:
  - **New Request**: Notify User A when User B requests a swap.
  - **Request Accepted**: Notify User B when User A accepts.
  - **Daily Reminder**: "Time to test your apps!" (e.g., sent if proof not uploaded by 8 PM).
  - **Proof Status**: Notify when a proof is approved or rejected.
  - **New Message**: Chat notifications.
- **Implementation**:
  - Push Notifications via Expo Notifications.
  - In-App Notification Center.

### G. Automation & Safety (Production Ready)
- **Cron Jobs (Scheduled Tasks)**:
  - **Daily Check**: Runs every midnight. Checks matches where proofs weren't uploaded. Marks them as "Missed" and deducts reputation.
  - **Reminders**: Runs at 6 PM. Sends push notifications to users who haven't uploaded yet today.
  - **Chat Cleanup**: Runs daily. Deletes messages and associated media files older than 7 days.
- **Dispute Resolution**:
  - If a proof is rejected, the uploader can "Report Problem".
  - Admins can review the proof and override the decision.
- **Soft Deletes**:
  - Apps and Matches are never hard-deleted immediately. They are marked `isArchived: true` to prevent data loss.

---

## 3. Database Schema (Convex)

### `users`
- `_id`: Id
- `clerkId`: String (Auth)
- `name`: String
- `email`: String
- `avatarUrl`: String
- `reputation`: Number (Default: 100)
- `appsCount`: Number
- `pushToken`: String (Expo Push Token for notifications)
- `isGroupMember`: Boolean (Has confirmed joining Google Group)
- `createdAt`: Number
- `updatedAt`: Number
*Indexes: `by_clerkId`, `by_tokenIdentifier`*

### `apps`
- `_id`: Id
- `userId`: Id<"users">
- `title`: String
- `packageName`: String (e.g., com.example.app)
- `playStoreUrl`: String
- `iconUrl`: String
- `instructions`: String
- `requiredTesters`: Number (e.g., 12 - target number needed)
- `currentTesters`: Number (Count of active/completed matches)
- `status`: String ('recruiting', 'filled', 'paused', 'archived')
- `createdAt`: Number
- `updatedAt`: Number
*Indexes: `by_userId`, `by_status`*

### `matches`
- `_id`: Id
- `user1Id`: Id<"users">
- `app1Id`: Id<"apps"> (The app User 1 is getting tested)
- `user2Id`: Id<"users">
- `app2Id`: Id<"apps"> (The app User 2 is getting tested)
- `startDate`: Number (Timestamp)
- `status`: String ('pending', 'active', 'completed', 'cancelled')
- `lastActivity`: Number

### `proofs`
- `_id`: Id
- `matchId`: Id<"matches">
- `uploaderId`: Id<"users">
- `day`: Number (1-14)
- `type`: String ('image', 'video')
- `storageId`: String (Convex Storage ID)
- `status`: String ('pending', 'approved', 'rejected')
- `comment`: String (Optional)
- `submittedAt`: Number

### `messages`
- `_id`: Id
- `matchId`: Id<"matches">
- `senderId`: Id<"users">
- `content`: String
- `type`: String ('text', 'image', 'video')
- `storageId`: String (Optional, for media)
- `sentAt`: Number
*Indexes: `by_matchId`*

### `notifications`
- `_id`: Id
- `userId`: Id<"users">
- `type`: String ('request', 'acceptance', 'reminder', 'proof_update', 'message')
- `title`: String
- `body`: String
- `data`: Object (Related matchId, appId, etc.)
- `read`: Boolean
- `createdAt`: Number
*Indexes: `by_userId_read`*

### `reports` (Universal Reporting)
- `_id`: Id
- `reporterId`: Id<"users">
- `type`: String ('dispute', 'app_spam', 'toxic_user', 'other')
- `targetId`: String (ID of the Match, App, or User being reported)
- `description`: String
- `status`: String ('pending', 'resolved', 'dismissed')
- `adminNotes`: String
- `createdAt`: Number

### `analytics`
- `_id`: Id
- `date`: String (YYYY-MM-DD)
- `activeUsers`: Number (DAU)
- `activeMatches`: Number
- `proofsUploaded`: Number
- `appsSubmitted`: Number
- `reportsCreated`: Number
*Indexes: `by_date`*

---

## 4. UI/UX Structure

### 1. **Home (Dashboard)**
- Quick stats: Reputation, Active Tests.
- "Today's Tasks": List of apps needing proof upload today.
- "Recent Activity": Status updates on your apps.

### 2. **Marketplace**
- Browse Apps.
- Card UI: Icon, Title, "Need X Testers", "Request Swap" Button.

### 3. **My Apps**
- List of added apps (Max 3).
- "Add New App" Form.
- App Details: See who is testing your app.

### 4. **Match Detail (The "Work Area")**
- **Header**: Partner Info, Days Remaining (Day X / 14).
- **Tabs**:
  - **Chat**: Conversation view.
  - **Progress**: 14-Day Grid View.
  - **Upload**: Form to drag/drop screenshot.
  - **Review**: Pending proofs from partner to approve/reject.

### 5. **Profile**
- User Info.
- Reputation History.
- Trust Badges (e.g., "14 Day Survivor").

### 6. **Admin Dashboard (Hidden)**
- Restricted to specific emails (e.g., `neerajlovecyber...`).
- View All Reports.
- Global App/User Search.
- Manual Reputation Adjustment.

---

## 5. Technical Requirements
- **Frontend**: React Native (Expo)
- **Backend/database**: Convex
- **Auth**: Clerk
- **Storage**: Convex File Storage (Auto-delete > 7 days for chat media).
- **Media Optimization**: Client-side compression (JPEG conversion, resizing, max 5MB) before upload.
- **Notifications**: Push Notifications (Daily reminders, New swap requests)
