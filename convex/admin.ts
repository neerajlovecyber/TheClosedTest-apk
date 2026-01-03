import { query, mutation, internalMutation } from "./_generated/server";
import { v } from "convex/values";
import { internal } from "./_generated/api";

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
            });
        } else {
            await ctx.db.insert("analytics", {
                date: dateStr,
                activeUsers: activeUsersCount,
                activeMatches: activeMatchesCount,
                proofsUploaded: proofsCount,
                appsSubmitted: appsCount,
                reportsCreated: reportsCount,
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

export const getStats = query({
    args: {},
    handler: async (ctx) => {
        const users = await ctx.db.query("users").collect();
        const apps = await ctx.db.query("apps").collect();
        const matches = await ctx.db.query("matches").collect();
        const proofs = await ctx.db.query("proofs").collect();

        const totalUsers = users.length;
        const totalApps = apps.length;
        const activeMatches = matches.filter(m => m.status === 'active').length;
        const totalProofs = proofs.length;

        // Calculate some basic trends (e.g. users joined today)
        const now = Date.now();
        const oneDayAgo = now - 24 * 60 * 60 * 1000;
        const newUsersToday = users.filter(u => u.createdAt > oneDayAgo).length;

        // Calculate DAU (Based on check-ins)
        const todayStr = new Date().toISOString().split('T')[0];
        const dau = users.filter(u => u.lastCheckInDate === todayStr).length;

        // Trend Calculation
        const lastWeekStart = now - 8 * 24 * 60 * 60 * 1000;
        const lastWeekEnd = now - 7 * 24 * 60 * 60 * 1000;
        const newUsersLastWeek = users.filter(u => u.createdAt >= lastWeekStart && u.createdAt < lastWeekEnd).length;

        let newUsersTrend = 0;
        if (newUsersLastWeek > 0) {
            newUsersTrend = Math.round(((newUsersToday - newUsersLastWeek) / newUsersLastWeek) * 100);
        } else if (newUsersToday > 0) {
            newUsersTrend = 100;
        }

        const history = await ctx.db.query("analytics").withIndex("by_date").order("desc").take(7);

        return {
            totalUsers,
            totalApps,
            activeMatches,
            totalProofs,
            newUsersToday,
            dau,
            trends: {
                newUsers: newUsersTrend,
                newUsersCountLastWeek: newUsersLastWeek
            },
            history,
            recentUsers: users.sort((a, b) => b.createdAt - a.createdAt).slice(0, 5),
        };
    },
});

export const getUsersByFilter = query({
    args: {
        filter: v.union(v.literal("active"), v.literal("new"), v.literal("all")),
        dateStr: v.optional(v.string()), // Optional date filter
    },
    handler: async (ctx, args) => {
        const users = await ctx.db.query("users").collect();

        if (args.dateStr) {
            const startOfDay = new Date(args.dateStr).getTime();
            const endOfDay = startOfDay + 24 * 60 * 60 * 1000;

            if (args.filter === "new" || args.filter === "all") {
                return users.filter(u => u.createdAt >= startOfDay && u.createdAt < endOfDay)
                    .sort((a, b) => b.createdAt - a.createdAt);
            }
            if (args.filter === "active") {
                const logs = await ctx.db.query("daily_activity")
                    .withIndex("by_date", q => q.eq("date", args.dateStr!))
                    .collect();
                const userIds = new Set(logs.map(l => l.userId));
                return users.filter(u => userIds.has(u._id));
            }
        }

        const matches = await ctx.db.query("matches").collect();
        const now = Date.now();
        const oneDayAgo = now - 24 * 60 * 60 * 1000;

        if (args.filter === "active") {
            const activeUserIds = new Set<string>();
            matches.forEach(m => {
                if (m.status === 'active' || m.lastActivity > oneDayAgo) {
                    activeUserIds.add(m.user1Id);
                    activeUserIds.add(m.user2Id);
                }
            });
            users.forEach(u => {
                if (u.createdAt > oneDayAgo) activeUserIds.add(u._id);
                // Also check lastCheckInDate for "today"
                const todayStr = new Date().toISOString().split('T')[0];
                if (u.lastCheckInDate === todayStr) activeUserIds.add(u._id);
            });
            return users.filter(u => activeUserIds.has(u._id));
        }

        if (args.filter === "new") {
            return users.filter(u => u.createdAt > oneDayAgo).sort((a, b) => b.createdAt - a.createdAt);
        }

        // Default 'all'
        return users.sort((a, b) => b.createdAt - a.createdAt);
    },
});
