import { action, internalMutation, internalQuery } from "./_generated/server";
import { v } from "convex/values";
import { internal } from "./_generated/api";

// Helper to create a notification and send push notification automatically
export const createNotification = action({
    args: {
        userId: v.id("users"),
        type: v.any(), // Allow any string for notification type
        title: v.string(),
        body: v.string(),
        data: v.optional(v.any()),
    },
    handler: async (ctx, args) => {
        // Insert notification into database using internal mutation
        const notificationId = await ctx.runMutation(internal.notificationHelper.insertNotification, {
            userId: args.userId,
            type: args.type,
            title: args.title,
            body: args.body,
            data: args.data,
        });

        // Get user's push token
        const user = await ctx.runQuery(internal.notificationHelper.getUserById, {
            userId: args.userId,
        });

        if (!user || !user.pushToken) {
            console.log("User has no push token, skipping push notification");
            return notificationId;
        }

        // Send push notification
        const message = {
            to: user.pushToken,
            sound: 'default',
            title: args.title,
            body: args.body,
            data: args.data || {},
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
                console.error(`Failed to send push notification: ${response.status}`);
            } else {
                const result = await response.json();
                console.log("Push notification sent:", result.data?.status);
            }
        } catch (error) {
            console.error('Error sending push notification:', error);
        }

        return notificationId;
    },
});

// Internal mutation to insert notification
export const insertNotification = internalMutation({
    args: {
        userId: v.id("users"),
        type: v.any(),
        title: v.string(),
        body: v.string(),
        data: v.optional(v.any()),
    },
    handler: async (ctx, args) => {
        return await ctx.db.insert("notifications", {
            userId: args.userId,
            type: args.type,
            title: args.title,
            body: args.body,
            data: args.data || {},
            read: false,
            createdAt: Date.now(),
        });
    },
});

// Internal query to get user by ID
export const getUserById = internalQuery({
    args: { userId: v.id("users") },
    handler: async (ctx, args) => {
        return await ctx.db.get(args.userId);
    },
});
