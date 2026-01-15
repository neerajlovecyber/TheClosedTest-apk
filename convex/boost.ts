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
        // If there was an old cycle, reset all boost scores
        if (currentCycle) {
            const apps = await ctx.db.query("apps").collect();
            for (const app of apps) {
                if (app.boostScore && app.boostScore > 0) {
                    await ctx.db.patch(app._id, {
                        boostScore: 0,
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

// Get boost status including leaderboard and user's apps
export const getBoostStatus = query({
    args: {},
    handler: async (ctx) => {
        const now = Date.now();

        // Get current cycle info
        const cycles = await ctx.db
            .query("boost_cycles")
            .order("desc")
            .take(1);

        let cycleEnd = now + CYCLE_DURATION_MS; // Default if no cycle exists
        if (cycles.length > 0) {
            cycleEnd = cycles[0].cycleEnd;
            // If cycle has expired, show the next cycle end time
            if (cycleEnd <= now) {
                cycleEnd = now + CYCLE_DURATION_MS;
            }
        }

        const timeRemaining = Math.max(0, cycleEnd - now);

        // Get top 5 boosted apps (recruiting status only)
        const allApps = await ctx.db
            .query("apps")
            .withIndex("by_status", (q: any) => q.eq("status", "recruiting"))
            .collect();

        // Filter and sort by boost score
        const boostedApps = allApps
            .filter((app: any) => (app.boostScore || 0) > 0)
            .sort((a: any, b: any) => (b.boostScore || 0) - (a.boostScore || 0))
            .slice(0, 5);

        const topApps = await Promise.all(
            boostedApps.map(async (app: any, index: number) => {
                const ownerDoc = await ctx.db.get(app.userId);
                const owner = ownerDoc as { name?: string } | null;
                let iconUrl = app.iconUrl;
                if (app.storageIconId) {
                    iconUrl = await getImageUrl(ctx, app.storageIconId);
                }
                return {
                    _id: app._id,
                    title: app.title,
                    iconUrl,
                    boostScore: app.boostScore || 0,
                    rank: index + 1,
                    ownerName: owner?.name || "Unknown",
                };
            })
        );

        // Get current user's apps if authenticated
        let myApps: any[] = [];
        const identity = await ctx.auth.getUserIdentity();
        if (identity) {
            const user = await ctx.db
                .query("users")
                .withIndex("by_tokenIdentifier", (q: any) =>
                    q.eq("tokenIdentifier", identity.tokenIdentifier)
                )
                .unique();

            if (user) {
                const userApps = await ctx.db
                    .query("apps")
                    .withIndex("by_userId", (q: any) => q.eq("userId", user._id))
                    .collect();

                // Filter to only recruiting apps
                const recruitingApps = userApps.filter(
                    (app: any) => app.status === "recruiting"
                );

                myApps = await Promise.all(
                    recruitingApps.map(async (app: any) => {
                        let iconUrl = app.iconUrl;
                        if (app.storageIconId) {
                            iconUrl = await getImageUrl(ctx, app.storageIconId);
                        }

                        // Find rank in leaderboard
                        const allSorted = allApps
                            .filter((a: any) => (a.boostScore || 0) > 0)
                            .sort((a: any, b: any) => (b.boostScore || 0) - (a.boostScore || 0));
                        const rankIndex = allSorted.findIndex((a: any) => a._id === app._id);
                        const rank = rankIndex >= 0 ? rankIndex + 1 : null;

                        return {
                            _id: app._id,
                            title: app.title,
                            iconUrl,
                            boostScore: app.boostScore || 0,
                            rank,
                        };
                    })
                );
            }
        }

        return {
            cycleEnd,
            timeRemaining,
            topApps,
            myApps,
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

        // If cycle has expired, return empty (scores will be reset on next boost)
        if (cycles.length > 0 && cycles[0].cycleEnd <= now) {
            return [];
        }

        // Get recruiting apps with boost scores
        const allApps = await ctx.db
            .query("apps")
            .withIndex("by_status", (q: any) => q.eq("status", "recruiting"))
            .collect();

        // Filter and sort by boost score, take top 5
        const boostedApps = allApps
            .filter((app: any) => (app.boostScore || 0) > 0)
            .sort((a: any, b: any) => (b.boostScore || 0) - (a.boostScore || 0))
            .slice(0, 5);

        // Resolve URLs and owner info
        const appsWithDetails = await Promise.all(
            boostedApps.map(async (app: any) => {
                const ownerDoc = await ctx.db.get(app.userId);
                const owner = ownerDoc as { name?: string; avatarUrl?: string; reputation?: number } | null;
                let iconUrl = app.iconUrl;
                if (app.storageIconId) {
                    iconUrl = await getImageUrl(ctx, app.storageIconId);
                }
                return {
                    ...app,
                    iconUrl,
                    ownerName: owner?.name || "Unknown",
                    ownerAvatar: owner?.avatarUrl || "https://github.com/shadcn.png",
                    reputation: owner?.reputation || 0,
                };
            })
        );

        return appsWithDetails;
    },
});

// Boost an app by watching an ad
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

        // Verify user owns this app
        if (app.userId !== user._id) {
            throw new Error("You can only boost your own apps");
        }

        // Verify app is in recruiting status
        if (app.status !== "recruiting") {
            throw new Error("Only recruiting apps can be boosted");
        }

        // Get or create current cycle (this also handles reset if needed)
        await getOrCreateCurrentCycle(ctx);

        const now = Date.now();
        const currentScore = app.boostScore || 0;
        const newScore = currentScore + POINTS_PER_BOOST;

        // Update app with new boost score
        await ctx.db.patch(args.appId, {
            boostScore: newScore,
            lastBoostedAt: now,
            updatedAt: now,
        });

        return {
            success: true,
            newScore,
            pointsEarned: POINTS_PER_BOOST,
        };
    },
});

// Initialize boost cycle if it doesn't exist (call on app load)
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
