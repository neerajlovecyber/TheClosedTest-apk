
import { v } from "convex/values";
// Force sync
import { mutation, query } from "./_generated/server";

// Mutation to create a new app
export const createFile = mutation({
    args: {
        name: v.string(),
        type: v.string(),
    },
    handler: async (ctx, args) => {
        // We don't actually create a file here, we just return a URL to upload to.
        // This is a simplified version for now, typically you'd generate an upload URL.
        return await ctx.storage.generateUploadUrl();
    },
});

export const createApp = mutation({
    args: {
        title: v.string(),
        packageName: v.string(),
        playStoreUrl: v.string(),
        iconUrl: v.string(), // This will assume the file is already uploaded/managed or external
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
            iconUrl: args.iconUrl,
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

// Query to list apps for the marketplace
export const getMarketplaceApps = query({
    args: {
        status: v.optional(v.string())
    },
    handler: async (ctx, args) => {
        const status = (args.status || "recruiting") as "recruiting" | "filled" | "paused" | "archived";

        // In a real app, you might want pagination
        const apps = await ctx.db
            .query("apps")
            .withIndex("by_status", (q) => q.eq("status", status))
            .order("desc")
            .take(50);

        return apps;
    },
});

// Query to get my apps
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

        return await ctx.db
            .query("apps")
            .withIndex("by_userId", (q) => q.eq("userId", user._id))
            .collect();
    },
});
