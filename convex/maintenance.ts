import { v } from "convex/values";
import { internalMutation, mutation, query } from "./_generated/server";
import { Id } from "./_generated/dataModel";

// Helper to calculate current testing day (Day 1 to 14) based on midnight reset (IST/Local time logic)
const calculateDay = (startDate: number) => {
    if (!startDate) return 1;
    const IST_OFFSET = 5.5 * 60 * 60 * 1000; // Adjust for IST
    const DAY_MS = 24 * 60 * 60 * 1000;

    // Calculate calendar days since start
    const startDay = Math.floor((startDate + IST_OFFSET) / DAY_MS);
    const today = Math.floor((Date.now() + IST_OFFSET) / DAY_MS);

    const diff = today - startDay;
    const day = diff + 1;
    return day > 14 ? 14 : day;
};

// List apps where owner missed uploading proofs for 2 consecutive days
export const listInactiveApps = query({
    args: {},
    handler: async (ctx) => {
        const identity = await ctx.auth.getUserIdentity();
        if (!identity) throw new Error("Not authenticated");

        const user = await ctx.db
            .query("users")
            .withIndex("by_tokenIdentifier", q => q.eq("tokenIdentifier", identity.tokenIdentifier))
            .first();

        if (!user || !user.isAdmin) throw new Error("Unauthorized");

        // Get all active matches
        // Optimization: We could iterate users instead if we have an index for "has active matches", 
        // but iterating active matches is probably fine as there shouldn't be millions of ACTIVE matches.
        const activeMatches = await ctx.db
            .query("matches")
            .withIndex("by_status", (q) => q.eq("status", "active"))
            .collect();

        const slackersMap = new Map<string, {
            userId: Id<"users">;
            userName: string;
            userEmail: string;
            matchId: Id<"matches">;
            appId: Id<"apps">;
            daysMissed: number[];
            appName?: string;
            targetAppName?: string;
        }>();

        for (const match of activeMatches) {
            const currentDay = calculateDay(match.startDate);
            // Grace period: allow first 2 days to pass
            if (currentDay < 3) continue;

            // Check previous 2 days
            const daysToCheck = [currentDay - 1, currentDay - 2];

            // Get proofs for this match efficiently
            const proofs = await ctx.db
                .query("proofs")
                .withIndex("by_matchId", (q) => q.eq("matchId", match._id))
                .collect();

            // Check both users
            const usersInfo = [
                { id: match.user1Id, role: "user1", appId: match.app1Id }, // User1 owns App1 (offered) ?? Wait. 
                // RequestSwap: user1 (Requestor) offers app1. user2 (Target) owns app2.
                // If I am user1, I am testing app2. My app is app1.
                // If I miss uploading proof (for app2 testing), I get penalized.
                // AND my app (app1) gets archived? 
                // The original logic says: "Your apps have been archived". 
                // Yes, if I am a bad tester, my own apps lose visibility.

                { id: match.user2Id, role: "user2", appId: match.app2Id }
            ];

            for (const uInfo of usersInfo) {
                // Check if user missed BOTH days
                const missedBoth = daysToCheck.every(day => {
                    const hasProof = proofs.some(p => p.uploaderId === uInfo.id && p.day === day);
                    return !hasProof;
                });

                if (missedBoth) {
                    // Fetch user details if not already in map
                    if (!slackersMap.has(uInfo.id)) {
                        const slacker = await ctx.db.get(uInfo.id);
                        const app = await ctx.db.get(uInfo.appId);

                        // The app they were SUPPOSED to test (Other person's app)
                        const targetAppId = uInfo.role === "user1" ? match.app2Id : match.app1Id;
                        const targetApp = await ctx.db.get(targetAppId);

                        if (slacker) {
                            slackersMap.set(uInfo.id, {
                                userId: uInfo.id,
                                userName: slacker.name || "Unknown",
                                userEmail: slacker.email || "No Email",
                                matchId: match._id,
                                appId: uInfo.appId,
                                daysMissed: daysToCheck,
                                appName: app?.title,
                                targetAppName: targetApp?.title
                            });
                        }
                    }
                }
            }
        }

        return Array.from(slackersMap.values()).map(s => ({
            ...s,
            currentDay: calculateDay(activeMatches.find(m => m._id === s.matchId)?.startDate || 0)
        }));
    }
});

// Penalize an inactive user: delete their app, cancel matches, deduct reputation
export const penalizeInactiveUser = mutation({
    args: {
        userId: v.id("users"),
        appId: v.id("apps"),
    },
    handler: async (ctx, args) => {
        const identity = await ctx.auth.getUserIdentity();
        if (!identity) throw new Error("Not authenticated");

        const admin = await ctx.db
            .query("users")
            .withIndex("by_tokenIdentifier", q => q.eq("tokenIdentifier", identity.tokenIdentifier))
            .first();

        if (!admin || !admin.isAdmin) throw new Error("Unauthorized");

        const user = await ctx.db.get(args.userId);
        if (!user) throw new Error(`User not found: ${args.userId}`);

        const app = await ctx.db.get(args.appId);
        if (!app) throw new Error(`App not found: ${args.appId} (may have been already deleted)`);

        const now = Date.now();

        // 1. Find all matches involving this app
        const matchesAsApp1 = await ctx.db
            .query("matches")
            .withIndex("by_app1_status", q => q.eq("app1Id", args.appId).eq("status", "active"))
            .collect();

        const matchesAsApp2 = await ctx.db
            .query("matches")
            .withIndex("by_app2_status", q => q.eq("app2Id", args.appId).eq("status", "active"))
            .collect();

        const allMatches = [...matchesAsApp1, ...matchesAsApp2];

        // 2. Cancel all active matches
        for (const match of allMatches) {
            await ctx.db.patch(match._id, {
                status: "cancelled",
                lastActivity: now,
            });

            // Notify the partner
            const partnerId = match.user1Id === args.userId ? match.user2Id : match.user1Id;
            await ctx.db.insert("notifications", {
                userId: partnerId,
                type: "proof_update",
                title: "Test Cancelled",
                body: `Your test with ${app.title} was cancelled due to partner inactivity.`,
                data: { matchId: match._id },
                read: false,
                createdAt: now,
            });
        }

        // 3. Delete pending matches too
        const pendingAsApp1 = await ctx.db
            .query("matches")
            .filter(q => q.and(
                q.eq(q.field("app1Id"), args.appId),
                q.eq(q.field("status"), "pending")
            ))
            .collect();

        const pendingAsApp2 = await ctx.db
            .query("matches")
            .filter(q => q.and(
                q.eq(q.field("app2Id"), args.appId),
                q.eq(q.field("status"), "pending")
            ))
            .collect();

        for (const match of [...pendingAsApp1, ...pendingAsApp2]) {
            await ctx.db.delete(match._id);
        }

        // 4. Deduct 20 reputation (minimum 0)
        const newReputation = Math.max(0, user.reputation - 20);
        await ctx.db.patch(args.userId, {
            reputation: newReputation,
            updatedAt: now,
        });

        // 5. Delete the app
        await ctx.db.delete(args.appId);

        // 6. Notify the offending user
        await ctx.db.insert("notifications", {
            userId: args.userId,
            type: "proof_update",
            title: "⚠️ App Removed",
            body: `Your app "${app.title}" was removed due to inactivity. You lost 20 reputation.`,
            data: { reason: "inactivity" },
            read: false,
            createdAt: now,
        });

        return {
            success: true,
            appDeleted: app.title,
            matchesCancelled: allMatches.length,
            pendingDeleted: pendingAsApp1.length + pendingAsApp2.length,
            reputationBefore: user.reputation,
            reputationAfter: newReputation,
        };
    }
});
