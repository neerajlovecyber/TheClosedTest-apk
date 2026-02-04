import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

// 48 hours in milliseconds
const CYCLE_DURATION_MS = 48 * 60 * 60 * 1000;

// Points awarded per ad watch
const POINTS_PER_BOOST = 1;

// Helper to get image URL (Batched version preferred inline, this is kept for legacy calls)
const getImageUrl = async (ctx: any, storageId: string | undefined | null) => {
    if (!storageId) return "https://github.com/shadcn.png";
    if (storageId.startsWith("http")) return storageId;
    const url = await ctx.storage.getUrl(storageId);
    return url || "https://github.com/shadcn.png";
};

// Helper to get or create current boost cycle
async function getOrCreateCurrentCycle(ctx: any) {
    const now = Date.now();

    // Get the most recent cycle
    const cycles = await ctx.db
        .query("boost_cycles")
        .order("desc")
        .take(1);

    const currentCycle = cycles[0];

    // If no cycle exists or current cycle has ended, create a new one
    if (!currentCycle || currentCycle.cycleEnd <= now) {
        // If there was an old cycle, reset leaderboard ONLY
        if (currentCycle) {
            // Clear leaderboard - much faster than iterating all users
            const leaderboardEntries = await ctx.db.query("boost_leaderboard").collect();
            await Promise.all(leaderboardEntries.map((e: any) => ctx.db.delete(e._id)));
            // No need to clear users table anymore
        }

        // Create new cycle
        const cycleStart = now;
        const cycleEnd = now + CYCLE_DURATION_MS;
        const cycleId = await ctx.db.insert("boost_cycles", {
            cycleStart,
            cycleEnd,
        });

        return {
            _id: cycleId,
            cycleStart,
            cycleEnd,
        };
    }

    return currentCycle;
}

// Get boost status including user's points, selected app, and leaderboard
export const getBoostStatus = query({
    args: {},
    handler: async (ctx) => {
        const now = Date.now();

        // Get current cycle info
        const cycles = await ctx.db
            .query("boost_cycles")
            .order("desc")
            .take(1);

        let cycleEnd = now + CYCLE_DURATION_MS;
        if (cycles.length > 0) {
            cycleEnd = cycles[0].cycleEnd;
            if (cycleEnd <= now) {
                cycleEnd = now + CYCLE_DURATION_MS;
            }
        }

        const timeRemaining = Math.max(0, cycleEnd - now);

        // Get current user
        let currentUser: any = null;
        let myApps: any[] = [];
        let selectedApp: any = null;
        let userPoints = 0;

        const identity = await ctx.auth.getUserIdentity();
        if (identity) {
            currentUser = await ctx.db
                .query("users")
                .withIndex("by_tokenIdentifier", (q: any) =>
                    q.eq("tokenIdentifier", identity.tokenIdentifier)
                )
                .unique();

            if (currentUser) {
                // Get boost state from leaderboard
                const boostEntry = await ctx.db
                    .query("boost_leaderboard")
                    .withIndex("by_userId", (q: any) => q.eq("userId", currentUser._id))
                    .unique();

                userPoints = boostEntry?.boostScore || 0;

                // Get user's recruiting apps
                const userApps = await ctx.db
                    .query("apps")
                    .withIndex("by_userId", (q: any) => q.eq("userId", currentUser._id))
                    .collect();

                const recruitingApps = userApps.filter(
                    (app: any) => app.status === "recruiting"
                );

                myApps = await Promise.all(
                    recruitingApps.map(async (app: any) => {
                        let iconUrl = app.iconUrl;
                        return {
                            _id: app._id,
                            title: app.title,
                            iconUrl,
                            requiredTesters: app.requiredTesters,
                        };
                    })
                );


                // Get selected app details, or default to first app
                let boostedAppId = boostEntry?.appId;

                // If no app selected but user has recruiting apps, use first one
                if (!boostedAppId && recruitingApps.length > 0) {
                    boostedAppId = recruitingApps[0]._id;
                }

                if (boostedAppId) {
                    const boostedApp = await ctx.db.get(boostedAppId) as any;
                    if (boostedApp && boostedApp.status === "recruiting") {
                        let iconUrl = boostedApp.iconUrl;
                        selectedApp = {
                            _id: boostedApp._id,
                            title: boostedApp.title,
                            iconUrl,
                        };
                    }
                }
            }
        }

        // Get leaderboard: users with boostPoints > 0 and valid boostedAppId
        // OPTIMIZED: Use index on leaderboard table
        const topEntries = await ctx.db
            .query("boost_leaderboard")
            .withIndex("by_boostScore")
            .order("desc")
            .take(20);

        const validEntries = topEntries.filter(e => e.appId && e.boostScore > 0).slice(0, 5);

        // Batch fetch Apps and Users
        const apps = await Promise.all(validEntries.map(e => ctx.db.get(e.appId!)));
        const users = await Promise.all(validEntries.map(e => ctx.db.get(e.userId)));

        const appMap = new Map(apps.filter(Boolean).map(a => [a!._id, a]));
        const userMap = new Map(users.filter(Boolean).map(u => [u!._id, u]));

        // Batch fetch icons
        const urlMap = new Map<string, string>();

        const resolveIcon = (app: any) => {
            if (!app) return "https://github.com/shadcn.png";
            if (app.iconUrl && !app.iconUrl.startsWith("http")) return "https://github.com/shadcn.png";
            return app.iconUrl || "https://github.com/shadcn.png";
        };

        // Build leaderboard with app details
        const topApps = validEntries.map((entry: any, index: number) => {
            const app = appMap.get(entry.appId!) as any;
            const user = userMap.get(entry.userId) as any;

            if (!app || app.status !== "recruiting") return null;
            if (!user) return null;

            const actualTesters = app.currentTesters || 0;
            if (actualTesters >= app.requiredTesters) return null;

            return {
                _id: app._id,
                title: app.title,
                iconUrl: resolveIcon(app),
                boostScore: entry.boostScore,
                rank: index + 1,
                ownerName: user.name || "Unknown",
                userId: user._id,
            };
        })
            .filter((app): app is NonNullable<typeof app> => app !== null);

        // Re-rank after filtering
        const validTopApps = topApps.map((app, index) => ({ ...app, rank: index + 1 }));

        return {
            cycleEnd,
            timeRemaining,
            userPoints,
            selectedApp,
            myApps,
            topApps: validTopApps,
        };
    },
});

// Get boosted apps for marketplace display
export const getBoostedApps = query({
    args: {},
    handler: async (ctx) => {
        const now = Date.now();

        // Check if current cycle is valid
        const cycles = await ctx.db
            .query("boost_cycles")
            .order("desc")
            .take(1);

        if (cycles.length > 0 && cycles[0].cycleEnd <= now) {
            return [];
        }

        // Get users with boost points and selected apps
        // OPTIMIZED: Use index instead of full table scan
        const potentialEntries = await ctx.db
            .query("boost_leaderboard")
            .withIndex("by_boostScore")
            .order("desc")
            .take(50); // Fetch top 50

        const sortedEntries = potentialEntries
            .filter((e: any) => (e.boostScore || 0) > 0 && e.appId)
            .slice(0, 5);

        // Batch fetch apps and users
        const appIds = sortedEntries.map(e => e.appId!);
        const userIds = sortedEntries.map(e => e.userId);
        const apps = await Promise.all(appIds.map(id => ctx.db.get(id)));
        const users = await Promise.all(userIds.map(id => ctx.db.get(id)));

        const appMap = new Map(apps.filter(Boolean).map(a => [a!._id, a]));
        const userMap = new Map(users.filter(Boolean).map(u => [u!._id, u]));

        // Batch fetch icons
        const urlMap = new Map<string, string>();

        const resolveIcon = (app: any) => {
            if (!app) return "https://github.com/shadcn.png";
            if (app.iconUrl && !app.iconUrl.startsWith("http")) return "https://github.com/shadcn.png";
            return app.iconUrl || "https://github.com/shadcn.png";
        };

        // Build list with app details
        const boostedApps = sortedEntries.map((entry: any) => {
            const app = appMap.get(entry.appId) as any;
            const user = userMap.get(entry.userId) as any;

            if (!app || app.status !== "recruiting") return null;
            if (!user) return null;

            // Use cached currentTesters instead of querying matches
            const actualTesters = app.currentTesters || 0;

            // Skip filled apps
            if (actualTesters >= app.requiredTesters) return null;

            return {
                _id: app._id,
                title: app.title,
                status: app.status,
                requiredTesters: app.requiredTesters,
                iconUrl: resolveIcon(app),
                currentTesters: actualTesters,
                boostScore: entry.boostScore || 0,
                ownerName: user.name || "Unknown",
                ownerAvatar: user.avatarUrl || "https://github.com/shadcn.png",
                reputation: user.reputation || 0,
            };
        });

        return boostedApps.filter((app): app is NonNullable<typeof app> => app !== null);
    },
});

// Watch ad and earn points (adds to user's points, not app)
export const earnBoostPoints = mutation({
    args: {},
    handler: async (ctx) => {
        const identity = await ctx.auth.getUserIdentity();
        if (!identity) {
            throw new Error("You must be logged in to earn boost points");
        }

        const user = await ctx.db
            .query("users")
            .withIndex("by_tokenIdentifier", (q) =>
                q.eq("tokenIdentifier", identity.tokenIdentifier)
            )
            .unique();

        if (!user) {
            throw new Error("User not found");
        }

        // Ensure cycle exists
        await getOrCreateCurrentCycle(ctx);

        // Fetch current points from leaderboard
        const boostEntry = await ctx.db
            .query("boost_leaderboard")
            .withIndex("by_userId", (q: any) => q.eq("userId", user._id))
            .unique();

        const currentPoints = boostEntry?.boostScore || 0;
        const newPoints = currentPoints + POINTS_PER_BOOST;

        // Determine target app (preserve existing or auto-select first recruiting)
        let targetAppId = boostEntry?.appId;

        if (!targetAppId) {
            const userApp = await ctx.db
                .query("apps")
                .withIndex("by_userId", (q) => q.eq("userId", user._id))
                .filter((q) => q.eq(q.field("status"), "recruiting"))
                .first();

            if (userApp) {
                targetAppId = userApp._id;
            }
        }

        // Update leaderboard ONLY
        await updateLeaderboardEntry(ctx, user._id, newPoints, targetAppId);

        return {
            success: true,
            newPoints,
            pointsEarned: POINTS_PER_BOOST,
        };
    },
});

// Select which app to boost
export const selectBoostedApp = mutation({
    args: {
        appId: v.id("apps"),
    },
    handler: async (ctx, args) => {
        const identity = await ctx.auth.getUserIdentity();
        if (!identity) {
            throw new Error("You must be logged in");
        }

        const user = await ctx.db
            .query("users")
            .withIndex("by_tokenIdentifier", (q) =>
                q.eq("tokenIdentifier", identity.tokenIdentifier)
            )
            .unique();

        if (!user) {
            throw new Error("User not found");
        }

        const app = await ctx.db.get(args.appId);
        if (!app) {
            throw new Error("App not found");
        }

        // Verify user owns this app
        if (app.userId !== user._id) {
            throw new Error("You can only boost your own apps");
        }

        // Verify app is recruiting
        if (app.status !== "recruiting") {
            throw new Error("Only recruiting apps can be boosted");
        }

        // Get current score
        const boostEntry = await ctx.db
            .query("boost_leaderboard")
            .withIndex("by_userId", (q: any) => q.eq("userId", user._id))
            .unique();

        // Update leaderboard with new app
        await updateLeaderboardEntry(ctx, user._id, boostEntry?.boostScore || 0, args.appId);

        return { success: true };
    },
});

// Initialize boost cycle (called on app load)
export const initBoostCycle = mutation({
    args: {},
    handler: async (ctx) => {
        const cycle = await getOrCreateCurrentCycle(ctx);
        return {
            cycleStart: cycle.cycleStart,
            cycleEnd: cycle.cycleEnd,
        };
    },
});

// Legacy: Keep boostApp for backwards compatibility but redirect to earnBoostPoints
export const boostApp = mutation({
    args: {
        appId: v.id("apps"),
    },
    handler: async (ctx, args) => {
        const identity = await ctx.auth.getUserIdentity();
        if (!identity) {
            throw new Error("You must be logged in to boost an app");
        }

        const user = await ctx.db
            .query("users")
            .withIndex("by_tokenIdentifier", (q) =>
                q.eq("tokenIdentifier", identity.tokenIdentifier)
            )
            .unique();

        if (!user) {
            throw new Error("User not found");
        }

        const app = await ctx.db.get(args.appId);
        if (!app) {
            throw new Error("App not found");
        }

        if (app.userId !== user._id) {
            throw new Error("You can only boost your own apps");
        }

        if (app.status !== "recruiting") {
            throw new Error("Only recruiting apps can be boosted");
        }

        // Fetch current points from leaderboard
        const boostEntry = await ctx.db
            .query("boost_leaderboard")
            .withIndex("by_userId", (q: any) => q.eq("userId", user._id))
            .unique();

        await getOrCreateCurrentCycle(ctx);

        const currentPoints = boostEntry?.boostScore || 0;
        const newPoints = currentPoints + POINTS_PER_BOOST;

        // Update leaderboard ONLY
        await updateLeaderboardEntry(ctx, user._id, newPoints, args.appId);

        return {
            success: true,
            newScore: newPoints,
            pointsEarned: POINTS_PER_BOOST,
        };
    },
});

// Removed backfillLeaderboard as requested - data will populate naturally

// Helper to update leaderboard entry
async function updateLeaderboardEntry(
    ctx: any,
    userId: any, // Using any to avoid import issues if Id not imported, or string
    score: number,
    appId?: any | null
) {
    const existing = await ctx.db
        .query("boost_leaderboard")
        .withIndex("by_userId", (q: any) => q.eq("userId", userId))
        .unique();

    if (existing) {
        const patch: any = {
            boostScore: score,
            updatedAt: Date.now()
        };
        if (appId !== undefined) {
            patch.appId = appId;
        }
        await ctx.db.patch(existing._id, patch);
    } else {
        await ctx.db.insert("boost_leaderboard", {
            userId,
            boostScore: score,
            appId: appId || undefined,
            updatedAt: Date.now(),
        });
    }
}

export const cleanupLegacyFields = mutation({
    args: {},
    handler: async (ctx) => {
        const users = await ctx.db.query("users").collect();
        let count = 0;
        for (const user of users) {
            // Check if fields exist (even if undefined in types, they might be in DB)
            const u = user as any;
            if (u.boostPoints !== undefined || u.boostedAppId !== undefined) {
                await ctx.db.patch(user._id, {
                    boostPoints: undefined,
                    boostedAppId: undefined,
                } as any);
                count++;
            }
        }
        return `Cleaned legacy fields from ${count} users`;
    },
});

