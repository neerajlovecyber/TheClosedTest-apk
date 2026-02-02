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

// Helper to calculate current testing day
const calculateDay = (startDate: number) => {
    if (!startDate) return 1;
    const IST_OFFSET = 5.5 * 60 * 60 * 1000;
    const DAY_MS = 24 * 60 * 60 * 1000;
    const startDay = Math.floor((startDate + IST_OFFSET) / DAY_MS);
    const today = Math.floor((Date.now() + IST_OFFSET) / DAY_MS);
    const diff = today - startDay;
    const day = diff + 1;
    return day > 14 ? 14 : day;
};

// Internal query to get users who need upload reminders
export const getUsersNeedingReminders = internalQuery({
    args: {},
    handler: async (ctx) => {
        // Get all active matches
        const activeMatches = await ctx.db
            .query("matches")
            .filter((q) => q.eq(q.field("status"), "active"))
            .collect();

        if (activeMatches.length === 0) {
            return [];
        }

        // OPTIMIZED: Batch fetch recent proofs (days 1-14) in ONE query
        // Note: Each match may be on a different day (1-14) of their testing period.
        // We fetch all proofs for days 1-14 to cover all active matches.
        const allProofs = await ctx.db
            .query("proofs")
            .filter((q) => q.and(
                q.gte(q.field("day"), 1),
                q.lte(q.field("day"), 14)
            ))
            .collect();

        // Create lookup map: matchId+uploaderId+day -> proof
        const proofMap = new Map(
            allProofs.map(p => [`${p.matchId}-${p.uploaderId}-${p.day}`, p])
        );

        // Collect all app IDs to batch fetch
        const appIds = new Set<string>();
        for (const match of activeMatches) {
            appIds.add(match.app1Id);
            appIds.add(match.app2Id);
        }

        // Batch fetch all apps
        const apps = await Promise.all(
            Array.from(appIds).map(id => ctx.db.get(id as any))
        );
        const appMap = new Map(apps.filter(a => a).map(a => [a!._id, a]));

        const usersToRemind: Array<{
            userId: string;
            appName: string;
            matchId: string;
            day: number;
        }> = [];

        for (const match of activeMatches) {
            const matchDay = calculateDay(match.startDate);

            // Check both users in the match
            const users = [
                { userId: match.user1Id, appId: match.app2Id }, // User 1 tests App 2
                { userId: match.user2Id, appId: match.app1Id }, // User 2 tests App 1
            ];

            for (const { userId, appId } of users) {
                // OPTIMIZED: Use pre-fetched proof map instead of query
                // Use matchId+uploaderId+day as key since each match can be on different days
                const todayProof = proofMap.get(`${match._id}-${userId}-${matchDay}`);

                // No proof for today - needs reminder
                if (!todayProof) {
                    const app = appMap.get(appId);
                    usersToRemind.push({
                        userId: userId as string,
                        appName: app?.title || "your app",
                        matchId: match._id as string,
                        day: matchDay,
                    });
                }
            }
        }

        return usersToRemind;
    },
});

// Send gentle reminder (afternoon)
export const sendGentleReminders = action({
    args: {},
    handler: async (ctx) => {
        const usersToRemind = await ctx.runQuery(internal.notificationHelper.getUsersNeedingReminders, {});

        let sentCount = 0;
        for (const reminder of usersToRemind) {
            await ctx.runAction(internal.notificationHelper.createNotification, {
                userId: reminder.userId as any,
                type: "reminder",
                title: "📸 Daily Screenshot Reminder",
                body: `Don't forget to upload your Day ${reminder.day} screenshot for ${reminder.appName}!`,
                data: { matchId: reminder.matchId, type: "upload_reminder" },
            });
            sentCount++;
        }

        console.log(`Sent ${sentCount} gentle reminders.`);
    },
});

// Send urgent reminder (10 PM - last chance before penalty)
export const sendUrgentReminders = action({
    args: {},
    handler: async (ctx) => {
        const usersToRemind = await ctx.runQuery(internal.notificationHelper.getUsersNeedingReminders, {});

        let sentCount = 0;
        for (const reminder of usersToRemind) {
            await ctx.runAction(internal.notificationHelper.createNotification, {
                userId: reminder.userId as any,
                type: "reminder",
                title: "⚠️ Last Chance! Upload Now",
                body: `Upload your Day ${reminder.day} screenshot for ${reminder.appName} before midnight or lose reputation points!`,
                data: { matchId: reminder.matchId, type: "urgent_reminder" },
            });
            sentCount++;
        }

        console.log(`Sent ${sentCount} urgent reminders.`);
    },
});
