# Push Notifications Integration Guide

## Overview
This document explains how to integrate automatic push notifications into your app for key events.

## Files Created
- `convex/notifications.ts` - Contains all notification action functions

## Integration Points

### 1. Fix Missing Semicolon in matches.ts
**Location:** Line 109 in `convex/matches.ts`

**Change:**
```typescript
// BEFORE (line 109)
        createdAt: now,
    })

// AFTER
        createdAt: now,
    });
```

### 2. Add Notification to requestSwap (Match Request Created)
**Location:** After line 109 in `convex/matches.ts`

**Add this code before `return matchId;`:**
```typescript
// Send push notification
const myApp = await ctx.db.get(args.myAppId);
await ctx.scheduler.runAfter(0, internal.notifications.notifyMatchRequest, {
    recipientUserId: targetApp.userId,
    senderName: user.name || "Someone",
    appName: myApp?.name || "an app",
    matchId,
});
```

### 3. Add Notification to acceptSwap (Match Accepted)
**Location:** After line 245 in `convex/matches.ts`

**Add this code before `return true;`:**
```typescript
// Send push notification
const app2 = await ctx.db.get(match.app2Id);
await ctx.scheduler.runAfter(0, internal.notifications.notifyMatchAccepted, {
    recipientUserId: match.user1Id,
    accepterName: user.name || "Someone",
    appName: app2?.name || "an app",
    matchId: match._id,
});
```

### 4. Add Notification to uploadProof (Screenshot Uploaded)
**Location:** After line 681 in `convex/matches.ts`

**Add this code at the end of the handler:**
```typescript
// Notify partner that screenshot was uploaded
const partnerId = match.user1Id === user._id ? match.user2Id : match.user1Id;
const appToTest = match.user1Id === user._id ? await ctx.db.get(match.app2Id) : await ctx.db.get(match.app1Id);

await ctx.scheduler.runAfter(0, internal.notifications.notifyScreenshotUploaded, {
    recipientUserId: partnerId,
    uploaderName: user.name || "Your partner",
    appName: appToTest?.name || "the app",
    matchId: args.matchId,
});
```

### 5. Add Import Statement
**Location:** Top of `convex/matches.ts` (after line 3)

**Add:**
```typescript
import { internal } from "./_generated/api";
```

## Notification Types Implemented

1. **Match Request** - Sent when someone requests to swap with you
2. **Match Accepted** - Sent when your request is accepted
3. **Screenshot Uploaded** - Sent when your partner uploads their proof
4. **Upload Reminder** - Can be triggered manually or via scheduled job
5. **Match Completed** - Can be triggered when all 14 days are done

## How to Use

### Manual Trigger (for testing)
You can call these from your admin panel or test them directly:

```typescript
await ctx.scheduler.runAfter(0, internal.notifications.notifyUploadReminder, {
    recipientUserId: userId,
    appName: "Test App",
    matchId: matchId,
});
```

### Scheduled Reminders
To send daily reminders for pending uploads, create a cron job in `convex/crons.ts`:

```typescript
import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

crons.daily(
  "send upload reminders",
  { hourUTC: 12 }, // 5:30 PM IST
  internal.notifications.sendDailyReminders
);

export default crons;
```

Then add this function to `convex/notifications.ts`:

```typescript
export const sendDailyReminders = internalMutation({
    handler: async (ctx) => {
        // Get all active matches
        const matches = await ctx.db
            .query("matches")
            .filter((q) => q.eq(q.field("status"), "active"))
            .collect();

        for (const match of matches) {
            const day = calculateDay(match.startDate);
            if (day > 14) continue; // Match completed

            // Check if user1 hasn't uploaded today
            const user1Proof = await ctx.db
                .query("proofs")
                .withIndex("by_matchId", (q) => q.eq("matchId", match._id))
                .filter((q) => q.and(
                    q.eq(q.field("uploaderId"), match.user1Id),
                    q.eq(q.field("day"), day)
                ))
                .first();

            if (!user1Proof) {
                const app = await ctx.db.get(match.app2Id);
                await ctx.scheduler.runAfter(0, internal.notifications.notifyUploadReminder, {
                    recipientUserId: match.user1Id,
                    appName: app?.name || "the app",
                    matchId: match._id,
                });
            }

            // Check if user2 hasn't uploaded today
            const user2Proof = await ctx.db
                .query("proofs")
                .withIndex("by_matchId", (q) => q.eq("matchId", match._id))
                .filter((q) => q.and(
                    q.eq(q.field("uploaderId"), match.user2Id),
                    q.eq(q.field("day"), day)
                ))
                .first();

            if (!user2Proof) {
                const app = await ctx.db.get(match.app1Id);
                await ctx.scheduler.runAfter(0, internal.notifications.notifyUploadReminder, {
                    recipientUserId: match.user2Id,
                    appName: app?.name || "the app",
                    matchId: match._id,
                });
            }
        }
    },
});
```

## Testing

1. Create a match request → Recipient should get notification
2. Accept the request → Requester should get notification  
3. Upload a screenshot → Partner should get notification
4. Test broadcast from admin panel → All users get notification

## Notes

- Notifications only send if the user has a push token registered
- Failed notifications are logged to console but don't throw errors
- Notifications include data payload for deep linking (can be used to navigate to specific screens)
