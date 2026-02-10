
import { v } from "convex/values";
import { mutation, query, internalMutation } from "./_generated/server";
import { Id } from "./_generated/dataModel";
import { api } from "./_generated/api";
import { appsAggregate } from "./aggregates";

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

        // Check if user is banned
        const userBan = await ctx.db
            .query("user_bans")
            .withIndex("by_userId", (q) => q.eq("userId", user._id))
            .first();

        if (userBan) {
            // Check if temporary ban has expired
            if (!userBan.permanent && userBan.expiresAt && userBan.expiresAt < Date.now()) {
                // Ban expired, allow
            } else {
                throw new Error(`Your account has been banned: ${userBan.reason}`);
            }
        }

        // Check if this package is banned
        const packageBan = await ctx.db
            .query("app_bans")
            .withIndex("by_packageName", (q) => q.eq("packageName", args.packageName))
            .first();

        if (packageBan) {
            throw new Error(`This app has been banned: ${packageBan.reason}`);
        }

        if (user.appsCount >= 100) {
            throw new Error("You can only have 100 active apps at a time.");
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
        });

        // Sync Apps aggregate
        const newApp = await ctx.db.get(appId);
        if (newApp) {
            await appsAggregate.insert(ctx, newApp);
        }

        // Update user's app count
        await ctx.db.patch(user._id, {
            appsCount: user.appsCount + 1,
            updatedAt: Date.now(),
        });

        // Notify admins and broadcast to users
        await ctx.scheduler.runAfter(0, api.notifications.notifyNewAppAdded, {
            appId,
            appName: args.title,
            ownerName: user.name || "Unknown User",
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

        // Reduced from 100 to 30 for better performance
        const apps = await ctx.db
            .query("apps")
            .withIndex("by_status", (q) => q.eq("status", status))
            .order("desc")
            .take(30);

        if (apps.length === 0) return [];

        // Batch fetch all owners in one go (instead of N queries)
        const ownerIds = [...new Set(apps.map(app => app.userId))];
        const owners = await Promise.all(ownerIds.map(id => ctx.db.get(id)));
        const ownerMap = new Map(owners.filter(Boolean).map(o => [o!._id, o!]));

        const threeDaysAgo = Date.now() - (3 * 24 * 60 * 60 * 1000);

        // Map over apps - use cached currentTesters instead of querying matches
        const appsWithUrls = await Promise.all(apps.map(async (app) => {
            let resolvedUrl = app.iconUrl;
            if (app.iconUrl && !app.iconUrl.startsWith("http")) {
                resolvedUrl = await getImageUrl(ctx, app.iconUrl);
            }

            // Use cached currentTesters (updated when matches change)
            const actualTesters = app.currentTesters || 0;

            // Check if filled
            const isFilled = actualTesters >= app.requiredTesters || app.status === "filled";

            // Check if new (created in last 3 days)
            const isNew = app.createdAt > threeDaysAgo && !isFilled;

            // Get owner from pre-fetched map
            const owner = ownerMap.get(app.userId);

            return {
                ...app,
                iconUrl: resolvedUrl,
                currentTesters: actualTesters,
                isFilled,
                isNew,
                ownerName: owner?.name || "Unknown",
                ownerEmail: owner?.email || null,
                ownerAvatar: owner?.avatarUrl || "https://github.com/shadcn.png",
                reputation: owner?.reputation || 0,
                flagCount: app.flagCount || 0,
                visibility: app.visibility
            };
        }));

        return appsWithUrls.map((app) => ({
            _id: app._id,
            title: app.title,
            iconUrl: app.iconUrl,
            currentTesters: app.currentTesters,
            requiredTesters: app.requiredTesters,
            isFilled: app.isFilled,
            isNew: app.isNew,
            ownerName: app.ownerName,
            // ownerEmail: app.ownerEmail, // Removed for bandwidth
            ownerAvatar: app.ownerAvatar,
            reputation: app.reputation,
            // flagCount: app.flagCount, // Removed for bandwidth
            visibility: app.visibility,
            createdAt: app.createdAt
        }));
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

        // Batch resolve icons
        const urlMap = new Map<string, string>();

        const resolveIcon = (app: any) => {
            if (!app) return "https://github.com/shadcn.png";
            if (app.iconUrl && !app.iconUrl.startsWith("http")) return "https://github.com/shadcn.png";
            return app.iconUrl || "https://github.com/shadcn.png";
        };

        // OPTIMIZED: Removed hasUnread calculation to prevent cache invalidation
        // hasUnread changes on every message, causing poor cache hit rates
        // Apps list itself changes rarely (only when user adds/deletes apps)
        const appsWithUrls = apps.map((app) => {
            const actualTesters = app.currentTesters || 0;

            return {
                _id: app._id,
                title: app.title,
                packageName: app.packageName,
                status: app.status,
                requiredTesters: app.requiredTesters,
                iconUrl: resolveIcon(app),
                currentTesters: actualTesters,
                visibility: app.visibility,
                createdAt: app.createdAt
            };
        });

        return appsWithUrls;
    },
});

export const getAppArgs = query({
    args: { appId: v.id("apps") },
    handler: async (ctx, args) => {
        const app = await ctx.db.get(args.appId);
        if (!app) return null;

        let resolvedUrl = app.iconUrl;
        if (app.iconUrl && !app.iconUrl.startsWith("http")) {
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

        // OPTIMIZED: Use pre-computed currentTesters field (synced by cron every 4 hours)
        // This eliminates 2 expensive match table queries
        const actualTesters = app.currentTesters || 0;
        const isFilled = actualTesters >= app.requiredTesters || app.status === "filled";

        return {
            ...app,
            iconUrl: resolvedUrl,
            currentTesters: actualTesters,
            isFilled,
            ownerName: owner?.name || "Unknown",
            ownerEmail: owner?.email || null,
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

        // 2. Process matches and collect partner apps to check
        const partnerAppIds: Id<"apps">[] = [];
        for (const match of allMatches) {
            if (match.status === "pending") {
                // Delete pending swap requests
                await ctx.db.delete(match._id);
            } else if (match.status === "active") {
                // Identify the partner app (the one NOT being deleted)
                const partnerAppId = match.app1Id === args.appId ? match.app2Id : match.app1Id;
                partnerAppIds.push(partnerAppId);

                // Cancel active tests - both parties lose progress
                await ctx.db.patch(match._id, {
                    status: "cancelled",
                    lastActivity: Date.now()
                });
            }
        }

        // 3. Check and revert 'filled' status for partner apps if needed
        for (const partnerAppId of partnerAppIds) {
            const partnerApp = await ctx.db.get(partnerAppId);
            if (partnerApp && partnerApp.status === "filled") {
                // Recalculate active tester count
                const activeMatches = await ctx.db
                    .query("matches")
                    .filter((q) => q.and(
                        q.or(q.eq(q.field("app1Id"), partnerAppId), q.eq(q.field("app2Id"), partnerAppId)),
                        q.or(
                            q.eq(q.field("status"), "active"),
                            q.eq(q.field("status"), "completed")
                        )
                    ))
                    .collect();

                if (activeMatches.length < partnerApp.requiredTesters) {
                    await ctx.db.patch(partnerAppId, { status: "recruiting" });
                }
            }
        }


        // Sync Apps aggregate (Delete)
        await appsAggregate.delete(ctx, app);

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
        });

        return {
            success: true,
            archivedMatches: allActiveMatches.length,
            deletedPendingRequests: allPendingMatches.length
        };
    }
});

// Fix a specific app's status if it's stuck as 'filled' when it shouldn't be
export const fixAppStatus = mutation({
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

        // Only owner or admin can fix
        if (app.userId !== user._id && !user.isAdmin) {
            throw new Error("Not authorized");
        }

        // Skip if not in a fixable state
        if (app.status !== "filled" && app.status !== "recruiting") {
            return { changed: false, message: `App is '${app.status}', no fix needed.` };
        }

        // Recalculate active tester count
        // Efficiently fetch active and completed matches for app1
        const activeMatches1 = await ctx.db
            .query("matches")
            .withIndex("by_app1_status", (q) => q.eq("app1Id", args.appId).eq("status", "active"))
            .collect();
        const completedMatches1 = await ctx.db
            .query("matches")
            .withIndex("by_app1_status", (q) => q.eq("app1Id", args.appId).eq("status", "completed"))
            .collect();

        // Efficiently fetch active and completed matches for app2
        const activeMatches2 = await ctx.db
            .query("matches")
            .withIndex("by_app2_status", (q) => q.eq("app2Id", args.appId).eq("status", "active"))
            .collect();
        const completedMatches2 = await ctx.db
            .query("matches")
            .withIndex("by_app2_status", (q) => q.eq("app2Id", args.appId).eq("status", "completed"))
            .collect();

        const matchesAsApp1 = [...activeMatches1, ...completedMatches1];
        const matchesAsApp2 = [...activeMatches2, ...completedMatches2];

        const actualTesters = matchesAsApp1.length + matchesAsApp2.length;
        const shouldBeFilled = actualTesters >= app.requiredTesters;

        let changed = false;
        let newStatus = app.status;

        if (shouldBeFilled && app.status !== "filled") {
            await ctx.db.patch(args.appId, { status: "filled" });
            newStatus = "filled";
            changed = true;
        } else if (!shouldBeFilled && app.status === "filled") {
            await ctx.db.patch(args.appId, { status: "recruiting" });
            newStatus = "recruiting";
            changed = true;
        }

        return {
            changed,
            actualTesters,
            requiredTesters: app.requiredTesters,
            oldStatus: app.status,
            newStatus,
            message: changed
                ? `Status corrected: ${app.status} → ${newStatus} (${actualTesters}/${app.requiredTesters} testers)`
                : `Status is correct: ${app.status} (${actualTesters}/${app.requiredTesters} testers)`
        };
    }
});

// Batch fix for all apps (Admin/Maintenance)
// Now also syncs currentTesters cache alongside status
export const fixAllAppStatuses = internalMutation({
    args: {},
    handler: async (ctx) => {
        // 1. Get ALL apps
        const apps = await ctx.db.query("apps").collect();

        let fixedCount = 0;
        let syncedCount = 0;
        let appsChecked = 0;
        let details: string[] = [];

        for (const app of apps) {
            appsChecked++;
            // Skip archived apps
            if (app.status === 'archived') continue;

            // Recalculate active tester count using specific status indexes (much faster)
            const activeMatches1 = await ctx.db
                .query("matches")
                .withIndex("by_app1_status", (q) => q.eq("app1Id", app._id).eq("status", "active"))
                .collect();
            const completedMatches1 = await ctx.db
                .query("matches")
                .withIndex("by_app1_status", (q) => q.eq("app1Id", app._id).eq("status", "completed"))
                .collect();

            const activeMatches2 = await ctx.db
                .query("matches")
                .withIndex("by_app2_status", (q) => q.eq("app2Id", app._id).eq("status", "active"))
                .collect();
            const completedMatches2 = await ctx.db
                .query("matches")
                .withIndex("by_app2_status", (q) => q.eq("app2Id", app._id).eq("status", "completed"))
                .collect();

            const activeMatches = [...activeMatches1, ...completedMatches1, ...activeMatches2, ...completedMatches2];
            const actualTesters = activeMatches.length;
            const shouldBeFilled = actualTesters >= app.requiredTesters;

            let statusChanged = false;
            let testersSynced = false;
            let newStatus = app.status;
            const updates: any = {};

            // Sync currentTesters if out of sync
            if (app.currentTesters !== actualTesters) {
                updates.currentTesters = actualTesters;
                testersSynced = true;
                syncedCount++;
            }

            // Fix status if needed (only for recruiting/filled apps)
            if (app.status === 'filled' || app.status === 'recruiting') {
                if (shouldBeFilled && app.status !== "filled") {
                    updates.status = "filled";
                    newStatus = "filled";
                    statusChanged = true;
                } else if (!shouldBeFilled && app.status === "filled") {
                    updates.status = "recruiting";
                    newStatus = "recruiting";
                    statusChanged = true;
                }
            }

            // Apply updates if any changes
            if (statusChanged || testersSynced) {
                await ctx.db.patch(app._id, updates);
                if (statusChanged) fixedCount++;

                const changes = [];
                if (testersSynced) changes.push(`testers: ${app.currentTesters} -> ${actualTesters}`);
                if (statusChanged) changes.push(`status: ${app.status} -> ${newStatus}`);
                details.push(`${app.title}: ${changes.join(', ')}`);
            }
        }

        return {
            success: true,
            totalApps: apps.length,
            appsChecked,
            statusFixed: fixedCount,
            testersSynced: syncedCount,
            details
        };
    }
});

// One-time migration: Sync currentTesters field for all apps
export const syncCurrentTesters = mutation({
    args: {},
    handler: async (ctx) => {
        const apps = await ctx.db.query("apps").collect();
        let updated = 0;

        for (const app of apps) {
            // Count using indexes
            // Count using new efficient indexes
            const activeMatches1 = await ctx.db
                .query("matches")
                .withIndex("by_app1_status", (q) => q.eq("app1Id", app._id).eq("status", "active"))
                .collect();
            const completedMatches1 = await ctx.db
                .query("matches")
                .withIndex("by_app1_status", (q) => q.eq("app1Id", app._id).eq("status", "completed"))
                .collect();

            const activeMatches2 = await ctx.db
                .query("matches")
                .withIndex("by_app2_status", (q) => q.eq("app2Id", app._id).eq("status", "active"))
                .collect();
            const completedMatches2 = await ctx.db
                .query("matches")
                .withIndex("by_app2_status", (q) => q.eq("app2Id", app._id).eq("status", "completed"))
                .collect();

            const activeMatches = [...activeMatches1, ...completedMatches1, ...activeMatches2, ...completedMatches2];
            const actualTesters = activeMatches.length;

            if (app.currentTesters !== actualTesters) {
                await ctx.db.patch(app._id, {
                    currentTesters: actualTesters,
                });
                updated++;
            }
        }

        return { totalApps: apps.length, updated };
    }
});

// Internal version for cron job - syncs currentTesters every 4 hours
export const internalSyncCurrentTesters = internalMutation({
    args: {},
    handler: async (ctx) => {
        const apps = await ctx.db.query("apps").collect();
        let counterUpdated = 0;
        let statusFixed = 0;
        let details: string[] = [];

        for (const app of apps) {
            // Skip archived/completed apps to save resources
            if (app.status === "archived") continue;

            // Count using indexes
            // Count using indexes efficiently
            const activeMatches1 = await ctx.db
                .query("matches")
                .withIndex("by_app1_status", (q) => q.eq("app1Id", app._id).eq("status", "active"))
                .collect();
            const completedMatches1 = await ctx.db
                .query("matches")
                .withIndex("by_app1_status", (q) => q.eq("app1Id", app._id).eq("status", "completed"))
                .collect();

            const activeMatches2 = await ctx.db
                .query("matches")
                .withIndex("by_app2_status", (q) => q.eq("app2Id", app._id).eq("status", "active"))
                .collect();
            const completedMatches2 = await ctx.db
                .query("matches")
                .withIndex("by_app2_status", (q) => q.eq("app2Id", app._id).eq("status", "completed"))
                .collect();

            const activeMatches = [...activeMatches1, ...completedMatches1, ...activeMatches2, ...completedMatches2];
            const actualTesters = activeMatches.length;
            const shouldBeFilled = actualTesters >= app.requiredTesters;

            const updates: any = {};
            const changes: string[] = [];

            // Fix counter drift
            if (app.currentTesters !== actualTesters) {
                updates.currentTesters = actualTesters;
                changes.push(`testers: ${app.currentTesters} -> ${actualTesters}`);
                counterUpdated++;
            }

            // Fix status mismatches (recruiting ↔ filled)
            if (app.status === 'filled' || app.status === 'recruiting') {
                if (shouldBeFilled && app.status !== "filled") {
                    updates.status = "filled";
                    changes.push(`status: ${app.status} -> filled`);
                    statusFixed++;
                } else if (!shouldBeFilled && app.status === "filled") {
                    updates.status = "recruiting";
                    changes.push(`status: ${app.status} -> recruiting`);
                    statusFixed++;
                }
            }

            // Apply updates if any changes needed
            if (Object.keys(updates).length > 0) {
                await ctx.db.patch(app._id, updates);
                details.push(`${app.title}: ${changes.join(', ')}`);
            }
        }

        console.log(`[Cron] Reconciliation complete: ${counterUpdated} counters synced, ${statusFixed} statuses fixed`, details);
        return { totalApps: apps.length, counterUpdated, statusFixed, details };
    }
});

// Verify App Visibility (Crowd-sourced)
export const verifyAppVisibility = mutation({
    args: {
        appId: v.id("apps"),
        isVisible: v.boolean(),
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

        // Do not allow owner to vote
        if (app.userId === user._id) throw new Error("Owner cannot vote");

        // Initialize visibility if missing
        const currentVisibility = app.visibility || {
            status: "unverified",
            positiveVotes: 0,
            negativeVotes: 0,
            voters: []
        };

        // Check if already voted
        if (currentVisibility.voters.includes(user._id)) {
            throw new Error("You have already voted");
        }

        // Update votes
        let { positiveVotes, negativeVotes, status, voters } = currentVisibility;
        if (args.isVisible) {
            positiveVotes++;
        } else {
            negativeVotes++;
        }

        voters.push(user._id);

        // Logic for determining status
        // Threshold: 2 votes to confirm
        if (positiveVotes >= 2) {
            status = "visible";
        } else if (negativeVotes >= 2) {
            status = "hidden";
            // Optional: Auto-flag the app as well?
        }

        await ctx.db.patch(args.appId, {
            visibility: {
                status,
                positiveVotes,
                negativeVotes,
                voters
            },
        });

        return { status };
    }
});

// Reset Visibility Status (Owner Action)
export const markAppFixed = mutation({
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

        // Reset to unverified
        await ctx.db.patch(args.appId, {
            visibility: {
                status: "unverified",
                positiveVotes: 0,
                negativeVotes: 0,
                voters: []
            },
            flagCount: 0, // Also reset flags if we are treating this as "I fixed it"
        });
    }
});


