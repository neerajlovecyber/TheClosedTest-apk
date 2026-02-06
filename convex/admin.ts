import { query, mutation, internalMutation, action, internalQuery } from "./_generated/server";
import { v } from "convex/values";
import { internal } from "./_generated/api";
import { Id } from "./_generated/dataModel";
import { usersAggregate, appsAggregate, matchesAggregate, dauAggregate } from "./aggregates";

export const internalSnapshotDailyStats = internalMutation({
    args: {},
    handler: async (ctx) => {
        const now = Date.now();
        const yesterday = new Date(now - 24 * 60 * 60 * 1000);
        const dateStr = yesterday.toISOString().split('T')[0];

        const startOfDay = new Date(dateStr).getTime();
        const endOfDay = startOfDay + 24 * 60 * 60 * 1000;

        const activeLogs = await ctx.db.query("daily_activity")
            .withIndex("by_date", q => q.eq("date", dateStr))
            .collect();
        const activeUsersCount = activeLogs.length;

        const matches = await ctx.db.query("matches").filter(q => q.eq(q.field("status"), "active")).collect();
        const activeMatchesCount = matches.length;

        const proofs = await ctx.db.query("proofs").collect();
        const proofsCount = proofs.filter(p => p.submittedAt >= startOfDay && p.submittedAt < endOfDay).length;

        const users = await ctx.db.query("users").collect();
        const newUsersCount = users.filter(u => u.createdAt >= startOfDay && u.createdAt < endOfDay).length;

        const apps = await ctx.db.query("apps").collect();
        const appsCount = apps.filter(a => a.createdAt >= startOfDay && a.createdAt < endOfDay).length;

        const reports = await ctx.db.query("reports").collect();
        const reportsCount = reports.filter(r => r.createdAt >= startOfDay && r.createdAt < endOfDay).length;

        const existing = await ctx.db.query("analytics").withIndex("by_date", q => q.eq("date", dateStr)).unique();

        if (existing) {
            await ctx.db.patch(existing._id, {
                activeUsers: activeUsersCount,
                activeMatches: activeMatchesCount,
                proofsUploaded: proofsCount,
                appsSubmitted: appsCount,
                reportsCreated: reportsCount,
                newUsers: newUsersCount,
            });
        } else {
            await ctx.db.insert("analytics", {
                date: dateStr,
                activeUsers: activeUsersCount,
                activeMatches: activeMatchesCount,
                proofsUploaded: proofsCount,
                appsSubmitted: appsCount,
                reportsCreated: reportsCount,
                newUsers: newUsersCount,
            });
        }
        return "Snapshot updated for " + dateStr;
    }
});

export const refreshDailyStats = mutation({
    args: {},
    handler: async (ctx) => {
        const identity = await ctx.auth.getUserIdentity();
        if (!identity) throw new Error("Unauthorized");

        await ctx.runMutation(internal.admin.internalSnapshotDailyStats, {});
        return "Analytics refreshed.";
    }
});

export const fixAllApps = mutation({
    args: {},
    handler: async (ctx): Promise<any> => {
        const identity = await ctx.auth.getUserIdentity();
        if (!identity) throw new Error("Unauthorized");

        const user = await ctx.db
            .query("users")
            .withIndex("by_tokenIdentifier", q => q.eq("tokenIdentifier", identity.tokenIdentifier))
            .unique();

        if (!user || !user.isAdmin) throw new Error("Admin only");

        return await ctx.runMutation(internal.apps.fixAllAppStatuses, {});
    }
});

export const getStats = query({
    args: {},
    handler: async (ctx) => {
        const now = Date.now();
        const todayStr = new Date(now).toISOString().split('T')[0];
        const startOfToday = new Date(todayStr).getTime();
        const oneDayAgo = now - 24 * 60 * 60 * 1000;
        const lastWeekStart = now - 8 * 24 * 60 * 60 * 1000;
        const lastWeekEnd = now - 7 * 24 * 60 * 60 * 1000;

        // Use counts instead of fetching all records
        // For total counts, we need to count but NOT fetch all fields
        // Optimized using @convex-dev/aggregate

        // Get aggregate stats using indexable queries where possible

        // Active Matches


        // Get recent users only (for trends) - not ALL users
        const recentUsers = await ctx.db
            .query("users")
            .order("desc")
            .take(100); // Only fetch recent 100 for trend calculation

        // Get DAU from aggregate
        // Get DAU from aggregate using bounds for today
        const dau = await dauAggregate.count(ctx, {
            bounds: { eq: todayStr }
        });

        // Count new users today more efficiently
        const newUsersToday = recentUsers.filter(u => u.createdAt >= startOfToday).length;
        const newUsersLastWeek = recentUsers.filter(u => u.createdAt >= lastWeekStart && u.createdAt < lastWeekEnd).length;

        let newUsersTrend = 0;
        if (newUsersLastWeek > 0) {
            newUsersTrend = Math.round(((newUsersToday - newUsersLastWeek) / newUsersLastWeek) * 100);
        } else if (newUsersToday > 0) {
            newUsersTrend = 100;
        }

        // Get history (already indexed) - contains pre-computed stats
        const history = await ctx.db.query("analytics").withIndex("by_date").order("desc").take(7);

        // For total counts - use aggregates
        const totalUsers = await usersAggregate.count(ctx);
        const totalApps = await appsAggregate.count(ctx);

        // Use latest analytics for proof count if available
        const latestAnalytics = history[0];
        const totalProofs = latestAnalytics?.proofsUploaded ?? 0;

        return {
            totalUsers,
            totalApps,
            newUsersToday,
            dau,
            trends: {
                newUsers: newUsersTrend,
                newUsersCountLastWeek: newUsersLastWeek
            },
            history: history.map(h => ({
                ...h,
                newUsers: h.newUsers || 0 // Use stored value from snapshot
            })),
            recentUsers: recentUsers.slice(0, 5),
        };
    },
});



export const getUsersByFilter = query({
    args: {
        filter: v.union(v.literal("active"), v.literal("new"), v.literal("all")),
        dateStr: v.optional(v.string()), // Optional date filter
    },
    handler: async (ctx, args) => {
        // Optimization: Handle specific filters efficiently
        if (args.dateStr) {
            const startOfDay = new Date(args.dateStr).getTime();
            const endOfDay = startOfDay + 24 * 60 * 60 * 1000;

            if (args.filter === "active") {
                const logs = await ctx.db.query("daily_activity")
                    .withIndex("by_date", q => q.eq("date", args.dateStr!))
                    .collect();
                const userIds = [...new Set(logs.map(l => l.userId))];
                const users = await Promise.all(userIds.map(id => ctx.db.get(id)));
                return users.filter(Boolean);
            }

            // For new/all with date, filter at DB level
            return await ctx.db.query("users")
                .filter(q => q.and(
                    q.gte(q.field("createdAt"), startOfDay),
                    q.lt(q.field("createdAt"), endOfDay)
                ))
                .collect();
        }

        const now = Date.now();
        const oneDayAgo = now - 24 * 60 * 60 * 1000;
        const todayStr = new Date(now).toISOString().split('T')[0];

        if (args.filter === "active") {
            const activeUserIds = new Set<string>();

            // 1. Get users active in matches
            const activeMatches = await ctx.db.query("matches")
                .filter(q => q.or(
                    q.eq(q.field("status"), 'active'),
                    q.gt(q.field("lastActivity"), oneDayAgo)
                ))
                .collect();

            activeMatches.forEach(m => {
                activeUserIds.add(m.user1Id);
                activeUserIds.add(m.user2Id);
            });

            // 2. Get users who checked in today
            const todayActivity = await ctx.db.query("daily_activity")
                .withIndex("by_date", q => q.eq("date", todayStr))
                .collect();
            todayActivity.forEach(l => activeUserIds.add(l.userId));

            // 3. Get new users (they are considered active)
            const newUsers = await ctx.db.query("users")
                .filter(q => q.gt(q.field("createdAt"), oneDayAgo))
                .collect();
            newUsers.forEach(u => activeUserIds.add(u._id));

            // Fetch the specific users we identified
            const users = await Promise.all(Array.from(activeUserIds).map(id => ctx.db.get(id as Id<"users">)));
            return users.filter(Boolean);
        }

        if (args.filter === "new") {
            return await ctx.db.query("users")
                .filter(q => q.gt(q.field("createdAt"), oneDayAgo))
                .collect();
        }

        // 'all': Limit to recent 200 users to save bandwidth
        return await ctx.db.query("users")
            .order("desc")
            .take(200);
    },
});

// Get notification stats
export const getNotificationStats = query({
    args: {},
    handler: async (ctx) => {
        const users = await ctx.db.query("users").collect();
        const totalUsers = users.length;
        const totalUsersWithTokens = users.filter(u => u.pushToken).length;

        return {
            totalUsers,
            totalUsersWithTokens,
        };
    },
});

// Send test notification to current user
export const sendTestNotification = action({
    args: {
        title: v.string(),
        body: v.string(),
        data: v.optional(v.any()),
    },
    handler: async (ctx, args): Promise<any> => {
        const identity = await ctx.auth.getUserIdentity();
        if (!identity) throw new Error("Unauthorized");

        console.log("🔍 Test notification - Identity:", identity.tokenIdentifier);

        const user: any = await ctx.runQuery(internal.admin.getUserByIdentity, {
            tokenIdentifier: identity.tokenIdentifier,
        });

        console.log("🔍 Test notification - User found:", {
            hasUser: !!user,
            userName: user?.name,
            hasPushToken: !!user?.pushToken,
            pushToken: user?.pushToken?.substring(0, 30) + '...',
        });

        if (!user || !user.pushToken) {
            throw new Error("No push token found for your account");
        }

        console.log("📤 Sending test notification to:", user.pushToken);

        // Send notification using Expo Push API
        const message = {
            to: user.pushToken,
            sound: 'default',
            title: args.title,
            body: args.body,
            data: args.data || { type: 'test' },
        };

        console.log("Message payload:", JSON.stringify(message));

        const response = await fetch('https://exp.host/--/api/v2/push/send', {
            method: 'POST',
            headers: {
                'Accept': 'application/json',
                'Accept-Encoding': 'gzip, deflate',
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(message),
        });

        const responseText = await response.text();
        console.log("Expo Push API Response:", responseText);

        if (!response.ok) {
            throw new Error(`Failed to send notification: ${response.status} - ${responseText}`);
        }

        const result = JSON.parse(responseText);
        console.log("Parsed result:", result);

        // Check if there were any errors in the response
        if (result.data && result.data[0] && result.data[0].status === 'error') {
            const errorMsg = result.data[0].message || 'Unknown error';
            console.error("Push notification error:", errorMsg);
            // Don't throw - return the error so UI can show it
            return {
                success: false,
                error: errorMsg,
                user: { name: user.name, email: user.email },
                result
            };
        }

        return {
            success: true,
            user: { name: user.name, email: user.email },
            result
        };
    },
});

// Send broadcast notification to all users with push tokens
export const sendBroadcastNotification = action({
    args: {
        title: v.string(),
        body: v.string(),
        data: v.optional(v.any()),
    },
    handler: async (ctx, args) => {
        const identity = await ctx.auth.getUserIdentity();
        if (!identity) throw new Error("Unauthorized");

        const users = await ctx.runQuery(internal.admin.getAllUsersWithTokens);

        if (users.length === 0) {
            throw new Error("No users with push tokens found");
        }

        console.log(`Sending broadcast to ${users.length} users`);

        // Deduplicate by push token (multiple accounts on same device = one notification)
        const uniqueTokens = new Map<string, any>();
        users.forEach((user: any) => {
            if (user.pushToken && !uniqueTokens.has(user.pushToken)) {
                uniqueTokens.set(user.pushToken, user);
            }
        });

        console.log(`Deduplicated to ${uniqueTokens.size} unique devices`);

        // Prepare messages for unique devices only
        const messages = Array.from(uniqueTokens.values()).map((user: any) => ({
            to: user.pushToken,
            sound: 'default',
            title: args.title,
            body: args.body,
            data: args.data || { type: 'broadcast' },
        }));

        // Send in batches of 100 (Expo limit)
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

                if (response.ok) {
                    const result = await response.json();
                    // Count successes and failures from response
                    if (Array.isArray(result.data)) {
                        result.data.forEach((item: any) => {
                            if (item.status === 'ok') {
                                successCount++;
                            } else {
                                failureCount++;
                            }
                        });
                    } else {
                        successCount += batch.length;
                    }
                } else {
                    failureCount += batch.length;
                }
            } catch (error) {
                failureCount += batch.length;
            }
        }

        return {
            successCount,
            failureCount,
            totalSent: messages.length,
        };
    },
});

// Internal query helpers for actions
export const getUserByIdentity = internalQuery({
    args: { tokenIdentifier: v.string() },
    handler: async (ctx, args) => {
        return await ctx.db
            .query("users")
            .withIndex("by_tokenIdentifier", (q) =>
                q.eq("tokenIdentifier", args.tokenIdentifier)
            )
            .unique();
    },
});

export const getAllUsersWithTokens = internalQuery({
    args: {},
    handler: async (ctx) => {
        const users = await ctx.db.query("users").collect();
        return users.filter(u => u.pushToken);
    },
});
