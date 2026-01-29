
import { v } from "convex/values";
import { mutation, query, internalMutation } from "./_generated/server";
import { Id } from "./_generated/dataModel";
import { api } from "./_generated/api";

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
            if (app.storageIconId) {
                resolvedUrl = await getImageUrl(ctx, app.storageIconId);
            } else if (app.iconUrl && !app.iconUrl.startsWith("http")) {
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
            ownerAvatar: app.ownerAvatar,
            reputation: app.reputation,
            flagCount: app.flagCount,
            visibility: app.visibility,
            updatedAt: app.updatedAt,
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

        // OPTIMIZED: Only fetch ACTIVE matches for unread count check
        // We don't need archived or pending matches to check for "unread active messages"
        const matchesAsUser1 = await ctx.db
            .query("matches")
            .withIndex("by_user1", (q) => q.eq("user1Id", user._id))
            .filter(q => q.eq(q.field("status"), "active"))
            .collect();

        const matchesAsUser2 = await ctx.db
            .query("matches")
            .withIndex("by_user2", (q) => q.eq("user2Id", user._id))
            .filter(q => q.eq(q.field("status"), "active"))
            .collect();

        const activeUserMatches = [...matchesAsUser1, ...matchesAsUser2];

        // Batch resolve icons
        const storageIds = new Set<string>();
        apps.forEach(app => {
            if (app?.storageIconId) storageIds.add(app.storageIconId);
        });
        const urlMap = new Map<string, string>();
        await Promise.all([...storageIds].map(async id => {
            const url = await ctx.storage.getUrl(id);
            if (url) urlMap.set(id, url);
        }));

        const resolveIcon = (app: any) => {
            if (!app) return "https://github.com/shadcn.png";
            if (app.storageIconId && urlMap.has(app.storageIconId)) return urlMap.get(app.storageIconId)!;
            if (app.iconUrl && !app.iconUrl.startsWith("http")) return "https://github.com/shadcn.png";
            return app.iconUrl || "https://github.com/shadcn.png";
        };

        // Map apps to resolved data
        const appsWithUrlsAndTesters = apps.map((app) => {
            // Use cached currentTesters
            const actualTesters = app.currentTesters || 0;

            // Check for unread in memory (now only iterating active matches)
            let hasUnread = false;
            // Only check matches related to THIS app
            const appMatches = activeUserMatches.filter(
                m => (m.app1Id === app._id || m.app2Id === app._id)
            );

            for (const m of appMatches) {
                const isUser1 = m.user1Id === user._id;
                const lastRead = isUser1 ? (m.lastRead1 || 0) : (m.lastRead2 || 0);
                if ((m.lastActivity || 0) > lastRead) {
                    hasUnread = true;
                    break;
                }
            }

            // OPTIMIZED: Explicitly return only needed fields
            return {
                _id: app._id,
                title: app.title,
                packageName: app.packageName,
                status: app.status,
                requiredTesters: app.requiredTesters,
                iconUrl: resolveIcon(app),
                currentTesters: actualTesters,
                hasUnread,
                visibility: app.visibility,
                createdAt: app.createdAt
            };
        });

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

        // Count active testers - use indexes for efficiency
        const matchesAsApp1 = await ctx.db
            .query("matches")
            .withIndex("by_app1", (q) => q.eq("app1Id", app._id))
            .collect();

        const matchesAsApp2 = await ctx.db
            .query("matches")
            .withIndex("by_app2", (q) => q.eq("app2Id", app._id))
            .collect();

        // Filter for active/completed status in memory (cheaper than filter() in query)
        const activeMatches = [...matchesAsApp1, ...matchesAsApp2].filter(
            m => m.status === "active" || m.status === "completed"
        );

        const actualTesters = activeMatches.length;
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
                    await ctx.db.patch(partnerAppId, { status: "recruiting", updatedAt: Date.now() });
                }
            }
        }

        // 4. Delete the app record
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
        const matchesAsApp1 = await ctx.db
            .query("matches")
            .filter((q) => q.and(
                q.eq(q.field("app1Id"), args.appId),
                q.or(
                    q.eq(q.field("status"), "active"),
                    q.eq(q.field("status"), "completed")
                )
            ))
            .collect();

        const matchesAsApp2 = await ctx.db
            .query("matches")
            .filter((q) => q.and(
                q.eq(q.field("app2Id"), args.appId),
                q.or(
                    q.eq(q.field("status"), "active"),
                    q.eq(q.field("status"), "completed")
                )
            ))
            .collect();

        const actualTesters = matchesAsApp1.length + matchesAsApp2.length;
        const shouldBeFilled = actualTesters >= app.requiredTesters;

        let changed = false;
        let newStatus = app.status;

        if (shouldBeFilled && app.status !== "filled") {
            await ctx.db.patch(args.appId, { status: "filled", updatedAt: Date.now() });
            newStatus = "filled";
            changed = true;
        } else if (!shouldBeFilled && app.status === "filled") {
            await ctx.db.patch(args.appId, { status: "recruiting", updatedAt: Date.now() });
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

            // Recalculate active tester count using indexes (faster)
            const matchesAsApp1 = await ctx.db
                .query("matches")
                .withIndex("by_app1", (q) => q.eq("app1Id", app._id))
                .collect();

            const matchesAsApp2 = await ctx.db
                .query("matches")
                .withIndex("by_app2", (q) => q.eq("app2Id", app._id))
                .collect();

            const activeMatches = [...matchesAsApp1, ...matchesAsApp2].filter(
                m => m.status === "active" || m.status === "completed"
            );
            const actualTesters = activeMatches.length;
            const shouldBeFilled = actualTesters >= app.requiredTesters;

            let statusChanged = false;
            let testersSynced = false;
            let newStatus = app.status;
            const updates: any = { updatedAt: Date.now() };

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
            const matchesAsApp1 = await ctx.db
                .query("matches")
                .withIndex("by_app1", (q) => q.eq("app1Id", app._id))
                .collect();
            const matchesAsApp2 = await ctx.db
                .query("matches")
                .withIndex("by_app2", (q) => q.eq("app2Id", app._id))
                .collect();

            const activeMatches = [...matchesAsApp1, ...matchesAsApp2].filter(
                m => m.status === "active" || m.status === "completed"
            );
            const actualTesters = activeMatches.length;

            if (app.currentTesters !== actualTesters) {
                await ctx.db.patch(app._id, {
                    currentTesters: actualTesters,
                    updatedAt: Date.now()
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
        let updated = 0;
        let details: string[] = [];

        for (const app of apps) {
            // Skip archived/completed apps to save resources
            if (app.status === "archived") continue;

            // Count using indexes
            const matchesAsApp1 = await ctx.db
                .query("matches")
                .withIndex("by_app1", (q) => q.eq("app1Id", app._id))
                .collect();
            const matchesAsApp2 = await ctx.db
                .query("matches")
                .withIndex("by_app2", (q) => q.eq("app2Id", app._id))
                .collect();

            const activeMatches = [...matchesAsApp1, ...matchesAsApp2].filter(
                m => m.status === "active" || m.status === "completed"
            );
            const actualTesters = activeMatches.length;

            if (app.currentTesters !== actualTesters) {
                await ctx.db.patch(app._id, {
                    currentTesters: actualTesters,
                    updatedAt: Date.now()
                });
                details.push(`${app.title}: ${app.currentTesters} -> ${actualTesters}`);
                updated++;
            }
        }

        console.log(`[Cron] Synced currentTesters: ${updated} apps updated`, details);
        return { totalApps: apps.length, updated, details };
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
            updatedAt: Date.now()
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
            updatedAt: Date.now()
        });
    }
});
