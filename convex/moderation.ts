import { mutation, query, internalMutation } from "./_generated/server";
import { v } from "convex/values";
import { internal } from "./_generated/api";

// Ban a user permanently or temporarily
export const banUser = mutation({
    args: {
        userId: v.id("users"),
        reason: v.string(),
        permanent: v.boolean(),
        expiresAt: v.optional(v.number()),
        bannedByType: v.optional(v.union(v.literal("manual"), v.literal("auto"))),
    },
    handler: async (ctx, args) => {
        const identity = await ctx.auth.getUserIdentity();
        if (!identity && args.bannedByType !== "auto") {
            throw new Error("Unauthorized");
        }

        let adminId: any = null;

        // For manual bans, check admin permissions
        if (!args.bannedByType || args.bannedByType === "manual") {
            const admin = await ctx.db
                .query("users")
                .withIndex("by_tokenIdentifier", (q) =>
                    q.eq("tokenIdentifier", identity!.tokenIdentifier)
                )
                .unique();

            if (!admin || !admin.isAdmin) {
                throw new Error("Admin access required");
            }
            adminId = admin._id;
        } else {
            // For auto-bans, use system (first admin or the user themselves)
            const firstAdmin = await ctx.db
                .query("users")
                .filter((q) => q.eq(q.field("isAdmin"), true))
                .first();
            adminId = firstAdmin?._id || args.userId;
        }

        // Check if user is already banned
        const existingBan = await ctx.db
            .query("user_bans")
            .withIndex("by_userId", (q) => q.eq("userId", args.userId))
            .first();

        if (existingBan) {
            throw new Error("User is already banned");
        }

        // Create ban record
        await ctx.db.insert("user_bans", {
            userId: args.userId,
            bannedBy: adminId,
            bannedByType: args.bannedByType || "manual",
            reason: args.reason,
            permanent: args.permanent,
            expiresAt: args.expiresAt,
            createdAt: Date.now(),
        });

        // Set reputation to 0
        await ctx.db.patch(args.userId, { reputation: 0 });

        // Archive all active matches for this user
        const matches = await ctx.db.query("matches").collect();
        const userMatches = matches.filter(
            (m) =>
                (m.user1Id === args.userId || m.user2Id === args.userId) &&
                m.status === "active"
        );

        for (const match of userMatches) {
            await ctx.db.patch(match._id, { status: "archived" });
        }

        // TODO: Send notification to banned user
        // This would show them they've been banned with the reason

        return { success: true };
    },
});

// Ban an app by package name
export const banApp = mutation({
    args: {
        appId: v.id("apps"),
        reason: v.string(),
    },
    handler: async (ctx, args) => {
        const identity = await ctx.auth.getUserIdentity();
        if (!identity) throw new Error("Unauthorized");

        const admin = await ctx.db
            .query("users")
            .withIndex("by_tokenIdentifier", (q) =>
                q.eq("tokenIdentifier", identity.tokenIdentifier)
            )
            .unique();

        if (!admin || !admin.isAdmin) {
            throw new Error("Admin access required");
        }

        const app = await ctx.db.get(args.appId);
        if (!app) throw new Error("App not found");

        // Check if package is already banned
        const existingBan = await ctx.db
            .query("app_bans")
            .withIndex("by_packageName", (q) => q.eq("packageName", app.packageName))
            .first();

        if (existingBan) {
            throw new Error("This app package is already banned");
        }

        // Create app ban record
        await ctx.db.insert("app_bans", {
            packageName: app.packageName,
            playStoreUrl: app.playStoreUrl,
            appId: args.appId,
            title: app.title,
            bannedBy: admin._id,
            reason: args.reason,
            createdAt: Date.now(),
        });

        // Archive the app
        await ctx.db.patch(args.appId, { status: "archived" });

        // TODO: Notify app owner
        // This would inform them their app has been banned

        return { success: true };
    },
});

// Issue a warning to a user
export const warnUser = mutation({
    args: {
        userId: v.id("users"),
        reason: v.string(),
    },
    handler: async (ctx, args) => {
        const identity = await ctx.auth.getUserIdentity();
        if (!identity) throw new Error("Unauthorized");

        const admin = await ctx.db
            .query("users")
            .withIndex("by_tokenIdentifier", (q) =>
                q.eq("tokenIdentifier", identity.tokenIdentifier)
            )
            .unique();

        if (!admin || !admin.isAdmin) {
            throw new Error("Admin access required");
        }

        const user = await ctx.db.get(args.userId);
        if (!user) throw new Error("User not found");

        // Create warning record
        await ctx.db.insert("user_warnings", {
            userId: args.userId,
            issuedBy: admin._id,
            reason: args.reason,
            read: false,
            createdAt: Date.now(),
        });

        // Decrease reputation by 10
        const newReputation = Math.max(0, user.reputation - 10);
        await ctx.db.patch(args.userId, { reputation: newReputation });

        // Check if auto-ban threshold reached
        if (newReputation < 10) {
            await ctx.scheduler.runAfter(0, internal.moderation.autoBanUser, {
                userId: args.userId,
            });
        }

        // TODO: Send notification to user about warning

        return { success: true, newReputation };
    },
});

// Internal mutation for auto-banning
export const autoBanUser = internalMutation({
    args: { userId: v.id("users") },
    handler: async (ctx, args) => {
        // Check if already banned
        const existingBan = await ctx.db
            .query("user_bans")
            .withIndex("by_userId", (q) => q.eq("userId", args.userId))
            .first();

        if (existingBan) return;

        // Get first admin for bannedBy field
        const firstAdmin = await ctx.db
            .query("users")
            .filter((q) => q.eq(q.field("isAdmin"), true))
            .first();

        await ctx.db.insert("user_bans", {
            userId: args.userId,
            bannedBy: firstAdmin?._id || args.userId,
            bannedByType: "auto",
            reason: "Automatically banned due to low reputation (below 10)",
            permanent: true,
            createdAt: Date.now(),
        });

        // Set reputation to 0
        await ctx.db.patch(args.userId, { reputation: 0 });

        // Archive active matches
        const matches = await ctx.db.query("matches").collect();
        const userMatches = matches.filter(
            (m) =>
                (m.user1Id === args.userId || m.user2Id === args.userId) &&
                m.status === "active"
        );

        for (const match of userMatches) {
            await ctx.db.patch(match._id, { status: "archived" });
        }
    },
});

// Resolve a report
export const resolveReport = mutation({
    args: {
        reportId: v.id("reports"),
        status: v.union(v.literal("resolved"), v.literal("dismissed")),
        adminNotes: v.optional(v.string()),
        actionTaken: v.optional(v.string()),
    },
    handler: async (ctx, args) => {
        const identity = await ctx.auth.getUserIdentity();
        if (!identity) throw new Error("Unauthorized");

        const admin = await ctx.db
            .query("users")
            .withIndex("by_tokenIdentifier", (q) =>
                q.eq("tokenIdentifier", identity.tokenIdentifier)
            )
            .unique();

        if (!admin || !admin.isAdmin) {
            throw new Error("Admin access required");
        }

        await ctx.db.patch(args.reportId, {
            status: args.status,
            adminNotes: args.adminNotes,
            actionTaken: args.actionTaken,
            resolvedAt: Date.now(),
        });

        return { success: true };
    },
});

// Check if a user is banned
export const checkUserBan = query({
    args: { userId: v.id("users") },
    handler: async (ctx, args) => {
        const ban = await ctx.db
            .query("user_bans")
            .withIndex("by_userId", (q) => q.eq("userId", args.userId))
            .first();

        if (!ban) return null;

        // Check if temporary ban has expired
        if (!ban.permanent && ban.expiresAt && ban.expiresAt < Date.now()) {
            return null;
        }

        return ban;
    },
});

// Check if an app package is banned
export const checkAppBan = query({
    args: { packageName: v.string() },
    handler: async (ctx, args) => {
        const ban = await ctx.db
            .query("app_bans")
            .withIndex("by_packageName", (q) => q.eq("packageName", args.packageName))
            .first();

        return ban;
    },
});

// Get all banned users (admin only)
export const getBannedUsers = query({
    args: {},
    handler: async (ctx) => {
        const identity = await ctx.auth.getUserIdentity();
        if (!identity) throw new Error("Unauthorized");

        const admin = await ctx.db
            .query("users")
            .withIndex("by_tokenIdentifier", (q) =>
                q.eq("tokenIdentifier", identity.tokenIdentifier)
            )
            .unique();

        if (!admin || !admin.isAdmin) {
            throw new Error("Admin access required");
        }

        const bans = await ctx.db.query("user_bans").order("desc").collect();

        const enrichedBans = await Promise.all(
            bans.map(async (ban) => {
                const user = await ctx.db.get(ban.userId);
                const bannedBy = await ctx.db.get(ban.bannedBy);

                return {
                    ...ban,
                    user,
                    bannedByUser: bannedBy,
                };
            })
        );

        return enrichedBans;
    },
});

// Get all banned apps (admin only)
export const getBannedApps = query({
    args: {},
    handler: async (ctx) => {
        const identity = await ctx.auth.getUserIdentity();
        if (!identity) throw new Error("Unauthorized");

        const admin = await ctx.db
            .query("users")
            .withIndex("by_tokenIdentifier", (q) =>
                q.eq("tokenIdentifier", identity.tokenIdentifier)
            )
            .unique();

        if (!admin || !admin.isAdmin) {
            throw new Error("Admin access required");
        }

        const bans = await ctx.db.query("app_bans").order("desc").collect();

        const enrichedBans = await Promise.all(
            bans.map(async (ban) => {
                const bannedBy = await ctx.db.get(ban.bannedBy);

                return {
                    ...ban,
                    bannedByUser: bannedBy,
                };
            })
        );

        return enrichedBans;
    },
});

// Get warnings for a user
export const getUserWarnings = query({
    args: { userId: v.id("users") },
    handler: async (ctx, args) => {
        const warnings = await ctx.db
            .query("user_warnings")
            .withIndex("by_userId", (q) => q.eq("userId", args.userId))
            .order("desc")
            .collect();

        return warnings;
    },
});

// Get active (unread) warnings for the current user
export const getMyActiveWarnings = query({
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

        const warnings = await ctx.db
            .query("user_warnings")
            .withIndex("by_userId_read", (q) =>
                q.eq("userId", user._id).eq("read", false)
            )
            .order("desc")
            .collect();

        return warnings;
    },
});

// Mark warning as read
export const markWarningRead = mutation({
    args: { warningId: v.id("user_warnings") },
    handler: async (ctx, args) => {
        const identity = await ctx.auth.getUserIdentity();
        if (!identity) throw new Error("Unauthorized");

        const user = await ctx.db
            .query("users")
            .withIndex("by_tokenIdentifier", (q) =>
                q.eq("tokenIdentifier", identity.tokenIdentifier)
            )
            .unique();

        if (!user) throw new Error("User not found");

        const warning = await ctx.db.get(args.warningId);
        if (!warning) throw new Error("Warning not found");

        // Ensure the warning belongs to the user
        if (warning.userId !== user._id) {
            throw new Error("Unauthorized");
        }

        await ctx.db.patch(args.warningId, { read: true });

        return { success: true };
    },
});
