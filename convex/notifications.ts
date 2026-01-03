import { action, internalQuery } from "./_generated/server";
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

// Internal query to get user by ID
export const getUserById = internalQuery({
    args: { userId: v.id("users") },
    handler: async (ctx, args) => {
        return await ctx.db.get(args.userId);
    },
});
