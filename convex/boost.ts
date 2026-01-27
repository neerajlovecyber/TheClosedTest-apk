import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

// 48 hours in milliseconds
const CYCLE_DURATION_MS = 48 * 60 * 60 * 1000;

// Points awarded per ad watch
const POINTS_PER_BOOST = 1;

// Helper to get image URL
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
        // If there was an old cycle, reset all user boost points
        if (currentCycle) {
            const users = await ctx.db.query("users").collect();
            for (const user of users) {
                if (user.boostPoints && user.boostPoints > 0) {
                    await ctx.db.patch(user._id, {
                        boostPoints: 0,
                        updatedAt: now,
                    });
                }
            }
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
                userPoints = currentUser.boostPoints || 0;

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
                        if (app.storageIconId) {
                            iconUrl = await getImageUrl(ctx, app.storageIconId);
                        }
                        return {
                            _id: app._id,
                            title: app.title,
                            iconUrl,
                            requiredTesters: app.requiredTesters,
                        };
                    })
                );


                // Get selected app details, or default to first app
                let boostedAppId = currentUser.boostedAppId;

                // If no app selected but user has recruiting apps, use first one
                if (!boostedAppId && recruitingApps.length > 0) {
                    boostedAppId = recruitingApps[0]._id;
                }

                if (boostedAppId) {
                    const boostedApp = await ctx.db.get(boostedAppId) as any;
                    if (boostedApp && boostedApp.status === "recruiting") {
                        let iconUrl = boostedApp.iconUrl;
                        if (boostedApp.storageIconId) {
                            iconUrl = await getImageUrl(ctx, boostedApp.storageIconId);
                        }
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
        const allUsers = await ctx.db.query("users").collect();
        const usersWithBoosts = allUsers.filter(
            (u: any) => (u.boostPoints || 0) > 0 && u.boostedAppId
        );

        // Sort by points and take top 5
        const sortedUsers = usersWithBoosts
            .sort((a: any, b: any) => (b.boostPoints || 0) - (a.boostPoints || 0))
            .slice(0, 5);

        // Build leaderboard with app details
        const topApps = await Promise.all(
            sortedUsers.map(async (user: any, index: number) => {
                const app = await ctx.db.get(user.boostedAppId) as any;
                if (!app || app.status !== "recruiting") return null;

                // Check if filled
                const matchesAsApp1 = await ctx.db
                    .query("matches")
                    .filter((q: any) => q.and(
                        q.eq(q.field("app1Id"), app._id),
                        q.eq(q.field("status"), "active")
                    ))
                    .collect();
                const matchesAsApp2 = await ctx.db
                    .query("matches")
                    .filter((q: any) => q.and(
                        q.eq(q.field("app2Id"), app._id),
                        q.eq(q.field("status"), "active")
                    ))
                    .collect();
                const actualTesters = matchesAsApp1.length + matchesAsApp2.length;

                // Skip filled apps
                if (actualTesters >= app.requiredTesters) return null;

                let iconUrl = app.iconUrl;
                if (app.storageIconId) {
                    iconUrl = await getImageUrl(ctx, app.storageIconId);
                }

                return {
                    _id: app._id,
                    title: app.title,
                    iconUrl,
                    boostScore: user.boostPoints || 0,
                    rank: index + 1,
                    ownerName: user.name || "Unknown",
                    userId: user._id,
                };
            })
        );

        // Filter out nulls and re-rank
        const validTopApps = topApps
            .filter((app): app is NonNullable<typeof app> => app !== null)
            .map((app, index) => ({ ...app, rank: index + 1 }));

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
        const allUsers = await ctx.db.query("users").collect();
        const usersWithBoosts = allUsers.filter(
            (u: any) => (u.boostPoints || 0) > 0 && u.boostedAppId
        );

        // Sort by points and take top 5
        const sortedUsers = usersWithBoosts
            .sort((a: any, b: any) => (b.boostPoints || 0) - (a.boostPoints || 0))
            .slice(0, 5);

        // Build list with app details - use cached currentTesters
        const boostedApps = await Promise.all(
            sortedUsers.map(async (user: any) => {
                const app = await ctx.db.get(user.boostedAppId) as any;
                if (!app || app.status !== "recruiting") return null;

                // Use cached currentTesters instead of querying matches
                const actualTesters = app.currentTesters || 0;

                // Skip filled apps
                if (actualTesters >= app.requiredTesters) return null;

                let iconUrl = app.iconUrl;
                if (app.storageIconId) {
                    iconUrl = await getImageUrl(ctx, app.storageIconId);
                }

                return {
                    ...app,
                    iconUrl,
                    currentTesters: actualTesters,
                    boostScore: user.boostPoints || 0,
                    ownerName: user.name || "Unknown",
                    ownerAvatar: user.avatarUrl || "https://github.com/shadcn.png",
                    reputation: user.reputation || 0,
                };
            })
        );

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

        const now = Date.now();
        const currentPoints = user.boostPoints || 0;
        const newPoints = currentPoints + POINTS_PER_BOOST;

        await ctx.db.patch(user._id, {
            boostPoints: newPoints,
            updatedAt: now,
        });

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

        const now = Date.now();
        await ctx.db.patch(user._id, {
            boostedAppId: args.appId,
            updatedAt: now,
        });

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

        await getOrCreateCurrentCycle(ctx);

        const now = Date.now();
        const currentPoints = user.boostPoints || 0;
        const newPoints = currentPoints + POINTS_PER_BOOST;

        // Update user points and set this app as boosted
        await ctx.db.patch(user._id, {
            boostPoints: newPoints,
            boostedAppId: args.appId,
            updatedAt: now,
        });

        return {
            success: true,
            newScore: newPoints,
            pointsEarned: POINTS_PER_BOOST,
        };
    },
});
