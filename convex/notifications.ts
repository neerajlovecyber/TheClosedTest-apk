import { action, internalQuery, query, mutation, internalMutation } from "./_generated/server";
import { v } from "convex/values";
import { internal } from "./_generated/api";

// Helper function to send a push notification
async function sendPushNotification(
    pushToken: string,
    title: string,
    body: string,
    data?: Record<string, any>
) {
    const message = {
        to: pushToken,
        sound: 'default',
        title,
        body,
        data: data || {},
    };

    try {
        const response = await fetch('https://exp.host/--/api/v2/push/send', {
            method: 'POST',
            headers: {
                'Accept': 'application/json',
                'Accept-Encoding': 'gzip, deflate',
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(message),
        });

        if (!response.ok) {
            console.error(`Failed to send notification: ${response.status}`);
            return false;
        }

        const result = await response.json();
        return result.data?.status === 'ok';
    } catch (error) {
        console.error('Error sending push notification:', error);
        return false;
    }
}

// Send notification when user receives a match request
export const notifyMatchRequest = action({
    args: {
        recipientUserId: v.id("users"),
        senderName: v.string(),
        appName: v.string(),
        matchId: v.id("matches"),
    },
    handler: async (ctx, args) => {
        const recipient = await ctx.runQuery(internal.notifications.getUserById, {
            userId: args.recipientUserId,
        });

        if (!recipient?.pushToken) {
            console.log("Recipient has no push token");
            return false;
        }

        return await sendPushNotification(
            recipient.pushToken,
            '🎯 New Match Request!',
            `${args.senderName} wants to test ${args.appName} with you`,
            { type: 'match_request', matchId: args.matchId }
        );
    },
});

// Send notification when match request is accepted
export const notifyMatchAccepted = action({
    args: {
        recipientUserId: v.id("users"),
        accepterName: v.string(),
        appName: v.string(),
        matchId: v.id("matches"),
    },
    handler: async (ctx, args) => {
        const recipient = await ctx.runQuery(internal.notifications.getUserById, {
            userId: args.recipientUserId,
        });

        if (!recipient?.pushToken) {
            console.log("Recipient has no push token");
            return false;
        }

        return await sendPushNotification(
            recipient.pushToken,
            '✅ Match Accepted!',
            `${args.accepterName} accepted your request for ${args.appName}`,
            { type: 'match_accepted', matchId: args.matchId }
        );
    },
});

// Send notification when partner uploads screenshot
export const notifyScreenshotUploaded = action({
    args: {
        recipientUserId: v.id("users"),
        uploaderName: v.string(),
        appName: v.string(),
        matchId: v.id("matches"),
    },
    handler: async (ctx, args) => {
        const recipient = await ctx.runQuery(internal.notifications.getUserById, {
            userId: args.recipientUserId,
        });

        if (!recipient?.pushToken) {
            console.log("Recipient has no push token");
            return false;
        }

        return await sendPushNotification(
            recipient.pushToken,
            '📸 Screenshot Uploaded!',
            `${args.uploaderName} uploaded their screenshot for ${args.appName}`,
            { type: 'screenshot_uploaded', matchId: args.matchId }
        );
    },
});

// Send reminder to upload screenshot
export const notifyUploadReminder = action({
    args: {
        recipientUserId: v.id("users"),
        appName: v.string(),
        matchId: v.id("matches"),
    },
    handler: async (ctx, args) => {
        const recipient = await ctx.runQuery(internal.notifications.getUserById, {
            userId: args.recipientUserId,
        });

        if (!recipient?.pushToken) {
            console.log("Recipient has no push token");
            return false;
        }

        return await sendPushNotification(
            recipient.pushToken,
            '⏰ Upload Reminder',
            `Don't forget to upload your screenshot for ${args.appName}!`,
            { type: 'upload_reminder', matchId: args.matchId }
        );
    },
});

// Send notification when match is completed
export const notifyMatchCompleted = action({
    args: {
        recipientUserId: v.id("users"),
        appName: v.string(),
        matchId: v.id("matches"),
    },
    handler: async (ctx, args) => {
        const recipient = await ctx.runQuery(internal.notifications.getUserById, {
            userId: args.recipientUserId,
        });

        if (!recipient?.pushToken) {
            console.log("Recipient has no push token");
            return false;
        }

        return await sendPushNotification(
            recipient.pushToken,
            '🎉 Match Completed!',
            `Your testing session for ${args.appName} is complete!`,
            { type: 'match_completed', matchId: args.matchId }
        );
    },
});

// Send notification for admin chat message
export const notifyAdminChatMessage = action({
    args: {
        recipientUserId: v.id("users"),
        senderName: v.string(),
        isAdminSending: v.boolean(),
    },
    handler: async (ctx, args) => {
        const recipient = await ctx.runQuery(internal.notifications.getUserById, {
            userId: args.recipientUserId,
        });

        if (!recipient?.pushToken) {
            console.log("Recipient has no push token");
            return false;
        }

        const title = args.isAdminSending ? '💬 Support Reply' : '💬 New Support Message';
        const body = args.isAdminSending
            ? 'Admin has replied to your support chat'
            : `${args.senderName} sent you a message`;

        return await sendPushNotification(
            recipient.pushToken,
            title,
            body,
            { type: 'admin_chat' }
        );
    },
});

// Send notification when a new app is added
export const notifyNewAppAdded = action({
    args: {
        appName: v.string(),
        ownerName: v.string(),
        appId: v.id("apps"),
    },
    handler: async (ctx, args) => {
        const users = await ctx.runQuery(internal.admin.getAllUsersWithTokens);

        if (users.length === 0) return { success: false, count: 0 };

        console.log(`Sending new app notification to ${users.length} users`);

        const uniqueTokens = new Map<string, any>();
        users.forEach((user: any) => {
            if (user.pushToken && !uniqueTokens.has(user.pushToken)) {
                uniqueTokens.set(user.pushToken, user);
            }
        });

        const messages: any[] = [];

        for (const user of uniqueTokens.values()) {
            const isAdmin = user.isAdmin === true;

            // Customize message for Admin vs User
            const title = isAdmin ? '🚀 New App Submitted' : '🆕 New App Available!';
            const body = isAdmin
                ? `${args.ownerName} added "${args.appName}". Check it out!`
                : `${args.appName} needs testers! Earn rewards by testing it now.`;

            messages.push({
                to: user.pushToken,
                sound: 'default',
                title: title,
                body: body,
                data: { type: 'new_app', appId: args.appId },
            });
        }

        // Send in batches of 100
        const batchSize = 100;
        let successCount = 0;
        let failureCount = 0;

        for (let i = 0; i < messages.length; i += batchSize) {
            const batch = messages.slice(i, i + batchSize);
            try {
                const response = await fetch('https://exp.host/--/api/v2/push/send', {
                    method: 'POST',
                    headers: {
                        'Accept': 'application/json',
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify(batch),
                });

                if (response.ok) successCount += batch.length;
                else failureCount += batch.length;
            } catch (error) {
                failureCount += batch.length;
                console.error("Batch send error:", error);
            }
        }

        return { successCount, failureCount };
    },
});

// Internal query to get user by ID
export const getUserById = internalQuery({
    args: { userId: v.id("users") },
    handler: async (ctx, args) => {
        return await ctx.db.get(args.userId);
    },
});

// Get unread notification count
export const getUnreadCount = query({
    args: {},
    handler: async (ctx) => {
        const identity = await ctx.auth.getUserIdentity();
        if (!identity) return 0;

        const user = await ctx.db
            .query("users")
            .withIndex("by_tokenIdentifier", (q) => q.eq("tokenIdentifier", identity.tokenIdentifier))
            .unique();

        if (!user) return 0;

        const unreadNotifications = await ctx.db
            .query("notifications")
            .withIndex("by_userId_read", (q) => q.eq("userId", user._id).eq("read", false))
            .collect();

        return unreadNotifications.length;
    },
});

// Get user's notifications (recent first)
export const getMyNotifications = query({
    args: {},
    handler: async (ctx) => {
        const identity = await ctx.auth.getUserIdentity();
        if (!identity) return [];

        const user = await ctx.db
            .query("users")
            .withIndex("by_tokenIdentifier", (q) => q.eq("tokenIdentifier", identity.tokenIdentifier))
            .unique();

        if (!user) return [];

        // Simplified query: get by user, order desc by creation time
        // Note: We might need an index for this if volume is high.
        // Schema has "by_userId_read". We can use that if we only wanted read/unread.
        // Ideally we want all. Let's filter by user in-memory for now or add index later if needed.
        // Actually, schema definition: .index("by_userId_read", ["userId", "read"])
        // We can use this index and merge or just filter.
        // Better: define a separate index for "by_userId" or sort in memory for small sets.
        // Given current schema, let's just use the existing logic or inefficiently filter:
        // Proper way: Add index "by_userId" to schema.
        // Short term fix: Filter all notifications. (Not efficient but works for small app)
        // Wait, "by_userId_read" supports prefix "userId". So we can query all for user!

        return await ctx.db
            .query("notifications")
            .withIndex("by_userId_read", (q) => q.eq("userId", user._id))
            .order("desc") // This might not work if index doesn't support it, but userId is equality.
            // Actually, Convex indices dictate sort order. If index is ["userId", "read"], it sorts by read then creation (system).
            // Default creation time sort is only available on table scan or specific indexes.
            // Let's just collect and sort in memory for now (safe for < 100 items).
            .collect()
            .then(notifications => notifications.sort((a, b) => b.createdAt - a.createdAt).slice(0, 20));
    },
});

// Mark all notifications as read
export const markAllAsRead = mutation({
    args: {},
    handler: async (ctx) => {
        const identity = await ctx.auth.getUserIdentity();
        if (!identity) throw new Error("Unauthorized");

        const user = await ctx.db
            .query("users")
            .withIndex("by_tokenIdentifier", (q) => q.eq("tokenIdentifier", identity.tokenIdentifier))
            .unique();

        if (!user) throw new Error("User not found");

        const unread = await ctx.db
            .query("notifications")
            .withIndex("by_userId_read", (q) => q.eq("userId", user._id).eq("read", false))
            .collect();

        await Promise.all(unread.map(n => ctx.db.patch(n._id, { read: true })));
    },
});

// Mark single notification as read
export const markAsRead = mutation({
    args: { notificationId: v.id("notifications") },
    handler: async (ctx, args) => {
        const identity = await ctx.auth.getUserIdentity();
        if (!identity) throw new Error("Unauthorized");

        const notification = await ctx.db.get(args.notificationId);
        if (!notification) return; // Already deleted?

        // Verify ownership (optional but good practice)
        // const user = ... check if notification.userId matches user._id

        await ctx.db.patch(args.notificationId, { read: true });
    },
});

// Internal mutation to clean up old notifications
export const cleanupOldNotifications = internalMutation({
    args: {},
    handler: async (ctx) => {
        const sevenDaysAgo = Date.now() - (7 * 24 * 60 * 60 * 1000);

        // Find notifications older than 7 days
        // Note: Ideally needs an index on createdAt, but for small scale this is fine.
        // Or use by_userId_read index but scan all.
        // Better: just query all if no suitable index, or iterate.
        // Optimization: limit to 100 to avoid timeouts.

        const oldNotifications = await ctx.db
            .query("notifications")
            .filter(q => q.lt(q.field("createdAt"), sevenDaysAgo))
            .take(100);

        await Promise.all(oldNotifications.map(n => ctx.db.delete(n._id)));

        console.log(`Cleaned up ${oldNotifications.length} old notifications.`);
    },
});
