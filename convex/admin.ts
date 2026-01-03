import { query } from "./_generated/server";
import { v } from "convex/values";

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

        // Calculate DAU (Approximate: users in active matches + new users)
        const activeUserIds = new Set<string>();
        matches.forEach(m => {
            if (m.status === 'active' || m.lastActivity > oneDayAgo) {
                activeUserIds.add(m.user1Id);
                activeUserIds.add(m.user2Id);
            }
        });
        users.forEach(u => {
            if (u.createdAt > oneDayAgo) activeUserIds.add(u._id);
        });
        const dau = activeUserIds.size;

        return {
            totalUsers,
            totalApps,
            activeMatches,
            totalProofs,
            newUsersToday,
            dau,
            recentUsers: users.sort((a, b) => b.createdAt - a.createdAt).slice(0, 5),
        };
    },
});

export const getUsersByFilter = query({
    args: { filter: v.union(v.literal("active"), v.literal("new"), v.literal("all")) },
    handler: async (ctx, args) => {
        const users = await ctx.db.query("users").collect();
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
