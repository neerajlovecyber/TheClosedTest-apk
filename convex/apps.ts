
import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { Id } from "./_generated/dataModel";

// Helper to get image URL
const getImageUrl = async (ctx: any, storageId: string | undefined | null) => {
    if (!storageId) return "https://github.com/shadcn.png"; // Default fallback
    if (storageId.startsWith("http")) return storageId;
    const url = await ctx.storage.getUrl(storageId);
    return url || "https://github.com/shadcn.png";
};

export const createApp = mutation({
    args: {
        title: v.string(),
        packageName: v.string(),
        playStoreUrl: v.string(),
        iconUrl: v.string(), // Keeping for backward compat logic if needed, but we will prefer storageId
        storageId: v.optional(v.string()), // New field for storage ID
        instructions: v.string(),
        requiredTesters: v.number(),
    },
    handler: async (ctx, args) => {
        const identity = await ctx.auth.getUserIdentity();
        if (!identity) {
            throw new Error("You must be logged in to create an app");
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

        if (user.appsCount >= 100) {
            throw new Error("You can only have 100 active apps at a time.");
        }

        const appId = await ctx.db.insert("apps", {
            userId: user._id,
            title: args.title,
            packageName: args.packageName,
            playStoreUrl: args.playStoreUrl,
            iconUrl: args.storageId ? "" : args.iconUrl, // Clear text URL if storage ID is provided
            storageIconId: args.storageId, // Store the storage ID (add this field to schema later or rely on loose schema if enabled, usually need schema update)
            // Note: Schema update required if 'storageIconId' is not in schema. 
            // For now, I'll assume we can repurpose iconUrl or store it. 
            // ACTUALLY: Let's stick to using `iconUrl` as the string field. 
            // If it starts with "http", it's a URL. If it's a UUID, it's a storage ID? 
            // Safer: Add `storageIconId` to schema or update schema. let's check schema.ts first. or just put it in iconUrl if schema allows string. 
            // Re-reading plan: "Change iconUrl argument to accept storageId (string)". 
            // I will use `iconUrl` to store the storageId string if provided.
            instructions: args.instructions,
            requiredTesters: args.requiredTesters,
            currentTesters: 0,
            status: "recruiting",
            createdAt: Date.now(),
            updatedAt: Date.now(),
        });

        // Update user's app count
        await ctx.db.patch(user._id, {
            appsCount: user.appsCount + 1,
            updatedAt: Date.now(),
        });

        return appId;
    },
});

export const getMarketplaceApps = query({
    args: {
        status: v.optional(v.string())
    },
    handler: async (ctx, args) => {
        const status = (args.status || "recruiting") as "recruiting" | "filled" | "paused" | "archived";

        const apps = await ctx.db
            .query("apps")
            .withIndex("by_status", (q) => q.eq("status", status))
            .order("desc")
            .take(100);

        // Map over apps to resolve full image URLs and count active testers
        const appsWithUrls = await Promise.all(apps.map(async (app) => {
            let resolvedUrl = app.iconUrl;
            if (app.storageIconId) {
                resolvedUrl = await getImageUrl(ctx, app.storageIconId);
            } else if (app.iconUrl && !app.iconUrl.startsWith("http")) {
                // Fallback for any legacy data or mis-formatted strings
                resolvedUrl = await getImageUrl(ctx, app.iconUrl);
            }

            // Count active matches where this app is being tested
            const matchesAsApp1 = await ctx.db
                .query("matches")
                .filter((q) => q.and(
                    q.eq(q.field("app1Id"), app._id),
                    q.eq(q.field("status"), "active")
                ))
                .collect();

            const matchesAsApp2 = await ctx.db
                .query("matches")
                .filter((q) => q.and(
                    q.eq(q.field("app2Id"), app._id),
                    q.eq(q.field("status"), "active")
                ))
                .collect();

            const actualTesters = matchesAsApp1.length + matchesAsApp2.length;

            // Check if filled
            const isFilled = actualTesters >= app.requiredTesters || app.status === "filled";

            // Check if new (created in last 7 days)
            const sevenDaysAgo = Date.now() - (7 * 24 * 60 * 60 * 1000);
            const isNew = app.createdAt > sevenDaysAgo && !isFilled;

            // Also fetch owner details for the UI
            const owner = await ctx.db.get(app.userId);

            return {
                ...app,
                iconUrl: resolvedUrl,
                currentTesters: actualTesters,
                isFilled,
                isNew,
                ownerName: owner?.name || "Unknown",
                ownerAvatar: owner?.avatarUrl || "https://github.com/shadcn.png",
                reputation: owner?.reputation || 0
            };
        }));

        // Return apps sorted by creation time (desc) - native behavior of the query
        return appsWithUrls;
    },
});

export const getMyApps = query({
    args: {},
    handler: async (ctx) => {
        const identity = await ctx.auth.getUserIdentity();
        if (!identity) return [];

        const user = await ctx.db
            .query("users")
            .withIndex("by_tokenIdentifier", (q) =>
                q.eq("tokenIdentifier", identity.tokenIdentifier)
            )
            .unique();

        if (!user) return [];

        const apps = await ctx.db
            .query("apps")
            .withIndex("by_userId", (q) => q.eq("userId", user._id))
            .collect();

        // Map over apps to resolve full image URLs and count active testers
        const appsWithUrlsAndTesters = await Promise.all(apps.map(async (app) => {
            let resolvedUrl = app.iconUrl;
            if (app.storageIconId) {
                resolvedUrl = await getImageUrl(ctx, app.storageIconId);
            } else if (app.iconUrl && !app.iconUrl.startsWith("http")) {
                resolvedUrl = await getImageUrl(ctx, app.iconUrl);
            }

            // Count active matches where this app is being tested
            // (app is either app1Id or app2Id in an active match)
            const matchesAsApp1 = await ctx.db
                .query("matches")
                .filter((q) => q.and(
                    q.eq(q.field("app1Id"), app._id),
                    q.eq(q.field("status"), "active")
                ))
                .collect();

            const matchesAsApp2 = await ctx.db
                .query("matches")
                .filter((q) => q.and(
                    q.eq(q.field("app2Id"), app._id),
                    q.eq(q.field("status"), "active")
                ))
                .collect();

            const actualTesters = matchesAsApp1.length + matchesAsApp2.length;

            // Check if any active match has unread messages for this user (app owner)
            let hasUnread = false;
            const allActiveMatches = [...matchesAsApp1, ...matchesAsApp2];
            for (const m of allActiveMatches) {
                const isUser1 = m.user1Id === user._id;
                const lastRead = isUser1 ? (m.lastRead1 || 0) : (m.lastRead2 || 0);
                if ((m.lastActivity || 0) > lastRead) {
                    hasUnread = true;
                    break;
                }
            }

            return {
                ...app,
                iconUrl: resolvedUrl,
                currentTesters: actualTesters,
                hasUnread
            };
        }));

        return appsWithUrlsAndTesters;
    },
});

export const getAppArgs = query({
    args: { appId: v.id("apps") },
    handler: async (ctx, args) => {
        const app = await ctx.db.get(args.appId);
        if (!app) return null;

        let resolvedUrl = app.iconUrl;
        if (app.storageIconId) {
            resolvedUrl = await getImageUrl(ctx, app.storageIconId);
        } else if (app.iconUrl && !app.iconUrl.startsWith("http")) {
            resolvedUrl = await getImageUrl(ctx, app.iconUrl);
        }

        const owner = await ctx.db.get(app.userId);
        const identity = await ctx.auth.getUserIdentity();

        // Check if current user owns this app
        let isMine = false;
        if (identity) {
            const currentUser = await ctx.db
                .query("users")
                .withIndex("by_tokenIdentifier", (q) => q.eq("tokenIdentifier", identity.tokenIdentifier))
                .unique();
            if (currentUser && currentUser._id === app.userId) {
                isMine = true;
            }
        }

        // Count active testers
        const matchesAsApp1 = await ctx.db
            .query("matches")
            .filter((q) => q.and(
                q.eq(q.field("app1Id"), app._id),
                q.eq(q.field("status"), "active")
            ))
            .collect();

        const matchesAsApp2 = await ctx.db
            .query("matches")
            .filter((q) => q.and(
                q.eq(q.field("app2Id"), app._id),
                q.eq(q.field("status"), "active")
            ))
            .collect();

        const actualTesters = matchesAsApp1.length + matchesAsApp2.length;
        const isFilled = actualTesters >= app.requiredTesters || app.status === "filled";

        return {
            ...app,
            iconUrl: resolvedUrl,
            currentTesters: actualTesters,
            isFilled,
            ownerName: owner?.name || "Unknown",
            ownerAvatar: owner?.avatarUrl || "https://github.com/shadcn.png",
            reputation: owner?.reputation || 0,
            isMine
        };
    }
});

export const deleteApp = mutation({
    args: { appId: v.id("apps") },
    handler: async (ctx, args) => {
        const identity = await ctx.auth.getUserIdentity();
        if (!identity) throw new Error("Not authenticated");

        const user = await ctx.db
            .query("users")
            .withIndex("by_tokenIdentifier", (q) => q.eq("tokenIdentifier", identity.tokenIdentifier))
            .unique();

        if (!user) throw new Error("User not found");

        const app = await ctx.db.get(args.appId);
        if (!app) throw new Error("App not found");

        if (app.userId !== user._id) throw new Error("Not authorized");

        // 1. Find all matches involving this app
        const matchesAsApp1 = await ctx.db
            .query("matches")
            .filter((q) => q.eq(q.field("app1Id"), args.appId))
            .collect();

        const matchesAsApp2 = await ctx.db
            .query("matches")
            .filter((q) => q.eq(q.field("app2Id"), args.appId))
            .collect();

        const allMatches = [...matchesAsApp1, ...matchesAsApp2];

        // 2. Process matches
        for (const match of allMatches) {
            if (match.status === "pending") {
                // Delete pending swap requests
                await ctx.db.delete(match._id);
            } else if (match.status === "active") {
                // Cancel active tests - both parties lose progress
                await ctx.db.patch(match._id, {
                    status: "cancelled",
                    lastActivity: Date.now()
                });
            }
        }

        // 3. Delete the app record
        await ctx.db.delete(args.appId);
    }
});

export const updateApp = mutation({
    args: {
        appId: v.id("apps"),
        title: v.optional(v.string()),
        instructions: v.optional(v.string()),
        iconUrl: v.optional(v.string()), // Added to support updating icon after upload
        playStoreUrl: v.optional(v.string()),
        packageName: v.optional(v.string()),
        requiredTesters: v.optional(v.number()),
    },
    handler: async (ctx, args) => {
        const identity = await ctx.auth.getUserIdentity();
        if (!identity) throw new Error("Not authenticated");

        const user = await ctx.db
            .query("users")
            .withIndex("by_tokenIdentifier", (q) => q.eq("tokenIdentifier", identity.tokenIdentifier))
            .unique();

        if (!user) throw new Error("User not found");

        const app = await ctx.db.get(args.appId);
        if (!app) throw new Error("App not found");

        if (app.userId !== user._id) throw new Error("Not authorized");

        await ctx.db.patch(args.appId, {
            title: args.title ?? app.title,
            instructions: args.instructions ?? app.instructions,
            iconUrl: args.iconUrl ?? app.iconUrl,
            playStoreUrl: args.playStoreUrl ?? app.playStoreUrl,
            packageName: args.packageName ?? app.packageName,
            requiredTesters: args.requiredTesters ?? app.requiredTesters,
            updatedAt: Date.now(),
        });
    }
});

// Mark an app as completed (got production access)
export const markAppAsCompleted = mutation({
    args: { appId: v.id("apps") },
    handler: async (ctx, args) => {
        const identity = await ctx.auth.getUserIdentity();
        if (!identity) throw new Error("Not authenticated");

        const user = await ctx.db
            .query("users")
            .withIndex("by_tokenIdentifier", (q) => q.eq("tokenIdentifier", identity.tokenIdentifier))
            .unique();

        if (!user) throw new Error("User not found");

        const app = await ctx.db.get(args.appId);
        if (!app) throw new Error("App not found");

        if (app.userId !== user._id) throw new Error("Not authorized");

        if (app.status === "completed") throw new Error("App is already completed");

        // Check 7-day minimum
        const sevenDaysMs = 7 * 24 * 60 * 60 * 1000;
        if (Date.now() - app.createdAt < sevenDaysMs) {
            throw new Error("App must be at least 7 days old to mark as completed");
        }

        const now = Date.now();

        // 1. Find all active matches involving this app
        const activeMatchesAsApp1 = await ctx.db
            .query("matches")
            .filter((q) => q.and(
                q.eq(q.field("app1Id"), args.appId),
                q.eq(q.field("status"), "active")
            ))
            .collect();

        const activeMatchesAsApp2 = await ctx.db
            .query("matches")
            .filter((q) => q.and(
                q.eq(q.field("app2Id"), args.appId),
                q.eq(q.field("status"), "active")
            ))
            .collect();

        const allActiveMatches = [...activeMatchesAsApp1, ...activeMatchesAsApp2];

        // 2. Archive all active matches and give testers +5 rep
        for (const match of allActiveMatches) {
            // Determine who the tester is (the other user in the match)
            const testerId = match.user1Id === user._id ? match.user2Id : match.user1Id;

            // Archive the match
            await ctx.db.patch(match._id, {
                status: "archived",
                lastActivity: now,
            });

            // Give tester +5 reputation
            const tester = await ctx.db.get(testerId);
            if (tester) {
                await ctx.db.patch(testerId, {
                    reputation: tester.reputation + 5,
                    updatedAt: now,
                });

                // Send notification to tester
                await ctx.db.insert("notifications", {
                    userId: testerId,
                    type: "proof_update",
                    title: "🎉 App Launched!",
                    body: `${app.title} got production access! Your testing helped make this happen. +5 reputation!`,
                    data: { appId: args.appId },
                    read: false,
                    createdAt: now,
                });
            }
        }

        // 3. Find and silently delete all pending matches involving this app
        const pendingMatchesAsApp1 = await ctx.db
            .query("matches")
            .filter((q) => q.and(
                q.eq(q.field("app1Id"), args.appId),
                q.eq(q.field("status"), "pending")
            ))
            .collect();

        const pendingMatchesAsApp2 = await ctx.db
            .query("matches")
            .filter((q) => q.and(
                q.eq(q.field("app2Id"), args.appId),
                q.eq(q.field("status"), "pending")
            ))
            .collect();

        const allPendingMatches = [...pendingMatchesAsApp1, ...pendingMatchesAsApp2];

        // Delete pending matches silently (no notification)
        for (const match of allPendingMatches) {
            await ctx.db.delete(match._id);
        }

        // 4. Give owner +20 reputation bonus
        await ctx.db.patch(user._id, {
            reputation: user.reputation + 20,
            updatedAt: now,
        });

        // 5. Update app status to completed
        await ctx.db.patch(args.appId, {
            status: "completed",
            completedAt: now,
            updatedAt: now,
        });

        return {
            success: true,
            archivedMatches: allActiveMatches.length,
            deletedPendingRequests: allPendingMatches.length
        };
    }
});

// Get completed apps for Hall of Fame
export const getCompletedApps = query({
    args: {},
    handler: async (ctx) => {
        const apps = await ctx.db
            .query("apps")
            .withIndex("by_status", (q) => q.eq("status", "completed"))
            .order("desc")
            .take(50);

        // Map over apps to resolve full image URLs
        const appsWithUrls = await Promise.all(apps.map(async (app) => {
            let resolvedUrl = app.iconUrl;
            if (app.storageIconId) {
                resolvedUrl = await getImageUrl(ctx, app.storageIconId);
            } else if (app.iconUrl && !app.iconUrl.startsWith("http")) {
                resolvedUrl = await getImageUrl(ctx, app.iconUrl);
            }

            // Fetch owner details
            const owner = await ctx.db.get(app.userId);

            return {
                ...app,
                iconUrl: resolvedUrl,
                ownerName: owner?.name || "Unknown",
                ownerAvatar: owner?.avatarUrl || "https://github.com/shadcn.png",
                reputation: owner?.reputation || 0
            };
        }));

        // Sort by completedAt (most recent first)
        return appsWithUrls.sort((a, b) => (b.completedAt || 0) - (a.completedAt || 0));
    },
});
