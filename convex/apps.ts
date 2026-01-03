
import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { Id } from "./_generated/dataModel";

// Helper to get image URL
const getImageUrl = async (ctx: any, storageId: string | undefined | null) => {
    if (!storageId) return "https://github.com/shadcn.png"; // Default fallback
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

        if (user.appsCount >= 3) {
            throw new Error("You can only have 3 active apps at a time.");
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
            .take(50);

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
            updatedAt: Date.now(),
        });
    }
});
