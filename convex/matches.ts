import { ConvexError, v } from "convex/values";
import { mutation, query, internalMutation, internalQuery, internalAction } from "./_generated/server";
import { Id } from "./_generated/dataModel";
import { api, internal } from "./_generated/api";
import { matchesAggregate } from "./aggregates";

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

// Helper to sanitize avatar URL (remove default shadcn if present)
const resolveAvatarUrl = (url: string | undefined | null) => {
    if (!url || url === "https://github.com/shadcn.png") return undefined;
    return url;
};

// Request a swap (Create a pending match)
export const requestSwap = mutation({
    args: {
        targetAppId: v.id("apps"),
        myAppId: v.id("apps"),
        message: v.optional(v.string()), // Optional initial message
    },
    handler: async (ctx, args) => {
        const identity = await ctx.auth.getUserIdentity();
        if (!identity) {
            throw new ConvexError("Not authenticated");
        }

        const user = await ctx.db
            .query("users")
            .withIndex("by_tokenIdentifier", (q) =>
                q.eq("tokenIdentifier", identity.tokenIdentifier)
            )
            .unique();

        if (!user) {
            throw new ConvexError("User not found");
        }

        const targetApp = await ctx.db.get(args.targetAppId);
        if (!targetApp) {
            throw new ConvexError("Target app not found");
        }

        if (targetApp.userId === user._id) {
            throw new ConvexError("Cannot swap with your own app");
        }


        // Check if match already exists for THIS APP (pending or active)
        const existingMatch = await ctx.db
            .query("matches")
            .withIndex("by_user1", (q) => q.eq("user1Id", user._id))
            .filter((q) =>
                q.and(
                    q.eq(q.field("user2Id"), targetApp.userId),
                    q.eq(q.field("app2Id"), targetApp._id), // Only block if checking SAME app
                    q.or(
                        q.eq(q.field("status"), "pending"),
                        q.eq(q.field("status"), "active")
                    )
                )
            )
            .first();

        // Check reverse direction too (if they requested me for this app)
        const existingMatchReverse = await ctx.db
            .query("matches")
            .withIndex("by_user1", (q) => q.eq("user1Id", targetApp.userId))
            .filter((q) =>
                q.and(
                    q.eq(q.field("user2Id"), user._id),
                    q.eq(q.field("app1Id"), targetApp._id), // Only block if checking SAME app
                    q.or(
                        q.eq(q.field("status"), "pending"),
                        q.eq(q.field("status"), "active")
                    )
                )
            )
            .first();

        if (existingMatch || existingMatchReverse) {
            throw new ConvexError("You already have an active or pending swap for this app");
        }

        // Check if my app is already filled
        const myApp = await ctx.db.get(args.myAppId);
        if (!myApp) throw new ConvexError("My app not found");

        if (myApp.status === "filled") {
            throw new ConvexError("Your app already has enough testers");
        }
        if (myApp.status === "completed") {
            throw new ConvexError("Your app is already in production");
        }

        // Count testers for myApp efficiently using indices
        // 1. Matches where I am User1 (Requestor) and my app (App1) is being tested
        const myAppMatchesAsApp1 = await ctx.db
            .query("matches")
            .withIndex("by_user1", (q) => q.eq("user1Id", user._id))
            .filter((q) => q.and(
                q.eq(q.field("app1Id"), myApp._id),
                q.or(
                    q.eq(q.field("status"), "active"),
                    q.eq(q.field("status"), "completed")
                )
            ))
            .collect();

        // 2. Matches where I am User2 (Target) and my app (App2) is being tested
        const myAppMatchesAsApp2 = await ctx.db
            .query("matches")
            .withIndex("by_user2", (q) => q.eq("user2Id", user._id))
            .filter((q) => q.and(
                q.eq(q.field("app2Id"), myApp._id),
                q.or(
                    q.eq(q.field("status"), "active"),
                    q.eq(q.field("status"), "completed")
                )
            ))
            .collect();

        const myAppTotalTesters = myAppMatchesAsApp1.length + myAppMatchesAsApp2.length;

        if (myAppTotalTesters >= myApp.requiredTesters) {
            await ctx.db.patch(myApp._id, { status: "filled" });
            throw new ConvexError(`Your app "${myApp.title}" already has enough testers (${myAppTotalTesters}/${myApp.requiredTesters})`);
        }

        // Check if target app is already filled
        if (targetApp.status === "filled") {
            throw new ConvexError("This app already has enough testers");
        }
        if (targetApp.status === "completed") {
            throw new ConvexError("This app is already in production");
        }

        // Count testers for targetApp efficiently
        // We need to know who owns targetApp. We know targetApp.userId.
        const targetOwnerId = targetApp.userId;

        // 1. Matches where Target is User1 and targetApp is App1
        const targetAppMatchesAsApp1 = await ctx.db
            .query("matches")
            .withIndex("by_user1", (q) => q.eq("user1Id", targetOwnerId))
            .filter((q) => q.and(
                q.eq(q.field("app1Id"), targetApp._id),
                q.or(
                    q.eq(q.field("status"), "active"),
                    q.eq(q.field("status"), "completed")
                )
            ))
            .collect();

        // 2. Matches where Target is User2 and targetApp is App2
        const targetAppMatchesAsApp2 = await ctx.db
            .query("matches")
            .withIndex("by_user2", (q) => q.eq("user2Id", targetOwnerId))
            .filter((q) => q.and(
                q.eq(q.field("app2Id"), targetApp._id),
                q.or(
                    q.eq(q.field("status"), "active"),
                    q.eq(q.field("status"), "completed")
                )
            ))
            .collect();

        const targetAppTotalTesters = targetAppMatchesAsApp1.length + targetAppMatchesAsApp2.length;

        if (targetAppTotalTesters >= targetApp.requiredTesters) {
            await ctx.db.patch(targetApp._id, { status: "filled" });
            throw new ConvexError(`The app "${targetApp.title}" already has enough testers`);
        }

        const now = Date.now();

        const matchId = await ctx.db.insert("matches", {
            user1Id: user._id, // Requestor
            app1Id: args.myAppId, // App offered by Requestor
            user2Id: targetApp.userId, // Target User
            app2Id: args.targetAppId, // App owned by Target User
            status: "pending",
            startDate: 0, // Not started yet
            lastActivity: now,
            createdAt: now,
        });

        // Sync Matches Aggregate
        const newMatch = await ctx.db.get(matchId);
        if (newMatch) {
            await matchesAggregate.insert(ctx, newMatch);
        }

        // Create notification and send push notification automatically
        await ctx.scheduler.runAfter(0, internal.notificationHelper.createNotification, {
            userId: targetApp.userId,
            type: "request",
            title: "New Swap Request",
            body: `${user.name || "A user"} wants to swap tests with you!`,
            data: { matchId, appId: args.targetAppId },
        });

        return matchId;
    },
});

// Get requests incoming to the current user
export const getIncomingRequests = query({
    handler: async (ctx) => {
        const identity = await ctx.auth.getUserIdentity();
        if (!identity) {
            return [];
        }

        const user = await ctx.db
            .query("users")
            .withIndex("by_tokenIdentifier", (q) =>
                q.eq("tokenIdentifier", identity.tokenIdentifier)
            )
            .unique();

        if (!user) {
            return [];
        }

        // Find matches where I am user2 (the target) and status is pending
        // OPTIMIZED: Limit to 50 requests
        // OPTIMIZED: Limit to 50 requests, use index for reactivity isolation
        const requests = await ctx.db
            .query("matches")
            .withIndex("by_user2_status", (q) => q.eq("user2Id", user._id).eq("status", "pending"))
            .order("desc")
            .take(50);

        // Enrich data
        const enrichedRequests = await Promise.all(
            requests.map(async (match) => {
                const requestor = await ctx.db.get(match.user1Id);
                const offeredApp = await ctx.db.get(match.app1Id);
                const myAppToCheck = await ctx.db.get(match.app2Id);

                return {
                    _id: match._id,
                    createdAt: match.createdAt,
                    status: match.status,
                    requestor: requestor ? {
                        name: requestor.name,
                        avatarUrl: resolveAvatarUrl(requestor.avatarUrl)
                    } : undefined,
                    offeredApp: offeredApp ? {
                        _id: offeredApp._id,
                        title: offeredApp.title,
                        currentTesters: offeredApp.currentTesters,
                        requiredTesters: offeredApp.requiredTesters,
                        status: offeredApp.status
                    } : undefined,
                    myApp: myAppToCheck ? {
                        title: myAppToCheck.title,
                        currentTesters: myAppToCheck.currentTesters,
                        requiredTesters: myAppToCheck.requiredTesters,
                        status: myAppToCheck.status
                    } : undefined,
                };
            })
        );

        return enrichedRequests;
    },
});

export const acceptSwap = mutation({
    args: { matchId: v.id("matches") },
    handler: async (ctx, args) => {
        const identity = await ctx.auth.getUserIdentity();
        if (!identity) {
            throw new Error("Not authenticated");
        }

        const user = await ctx.db
            .query("users")
            .withIndex("by_tokenIdentifier", (q) => q.eq("tokenIdentifier", identity.tokenIdentifier))
            .unique();

        if (!user) throw new Error("User not found");

        const match = await ctx.db.get(args.matchId);
        if (!match) throw new Error("Match not found");

        if (match.user2Id !== user._id) {
            throw new Error("Not authorized to accept this request");
        }

        if (match.status !== 'pending') {
            throw new Error("Match is not pending");
        }

        // Get both apps
        const app1 = await ctx.db.get(match.app1Id);
        const app2 = await ctx.db.get(match.app2Id);

        // Helper to count active testers using indexes
        const countActiveTesters = async (appId: any) => {
            const matchesAsApp1 = await ctx.db
                .query("matches")
                .withIndex("by_app1", (q) => q.eq("app1Id", appId))
                .collect();
            const matchesAsApp2 = await ctx.db
                .query("matches")
                .withIndex("by_app2", (q) => q.eq("app2Id", appId))
                .collect();
            return [...matchesAsApp1, ...matchesAsApp2].filter(
                m => m.status === "active" || m.status === "completed"
            ).length;
        };

        // Check if apps are already filled BEFORE accepting
        if (app1) {
            const app1ActiveCount = await countActiveTesters(app1._id);
            if (app1ActiveCount >= app1.requiredTesters) {
                await ctx.db.patch(app1._id, { status: "filled", currentTesters: app1ActiveCount });
                throw new ConvexError(`${app1.title} already has enough testers`);
            }
        }

        if (app2) {
            const app2ActiveCount = await countActiveTesters(app2._id);
            if (app2ActiveCount >= app2.requiredTesters) {
                await ctx.db.patch(app2._id, { status: "filled", currentTesters: app2ActiveCount });
                throw new ConvexError(`${app2.title} already has enough testers`);
            }
        }

        // Accept the match
        await ctx.db.patch(args.matchId, {
            status: "active",
            startDate: Date.now(),
            lastActivity: Date.now(),
        });

        // Sync Matches Aggregate (Update Status)
        const updatedMatch = await ctx.db.get(args.matchId);
        if (updatedMatch) {
            await matchesAggregate.replace(ctx, match, updatedMatch);
        }

        // Update both apps' currentTesters and status
        if (app1) {
            const newCount = (app1.currentTesters || 0) + 1;
            const newStatus = newCount >= app1.requiredTesters ? "filled" : app1.status;
            await ctx.db.patch(app1._id, {
                currentTesters: newCount,
                status: newStatus === "recruiting" || newStatus === "filled" ? newStatus : app1.status,
            });
        }

        if (app2) {
            const newCount = (app2.currentTesters || 0) + 1;
            const newStatus = newCount >= app2.requiredTesters ? "filled" : app2.status;
            await ctx.db.patch(app2._id, {
                currentTesters: newCount,
                status: newStatus === "recruiting" || newStatus === "filled" ? newStatus : app2.status,
            });
        }

        // Notify the requestor
        await ctx.db.insert("notifications", {
            userId: match.user1Id,
            type: "acceptance",
            title: "Swap Accepted!",
            body: `${user.name || "User"} accepted your swap request.`,
            data: { matchId: match._id },
            read: false,
            createdAt: Date.now(),
        });

        // Notify the requestor
        await ctx.scheduler.runAfter(0, internal.notificationHelper.createNotification, {
            userId: match.user1Id,
            type: "acceptance",
            title: "Swap Accepted!",
            body: `${user.name || "User"} accepted your swap request.`,
            data: { matchId: match._id },
        });

        return true;
    },
});


export const rejectSwap = mutation({
    args: { matchId: v.id("matches") },
    handler: async (ctx, args) => {
        const identity = await ctx.auth.getUserIdentity();
        if (!identity) {
            throw new Error("Not authenticated");
        }

        const user = await ctx.db
            .query("users")
            .withIndex("by_tokenIdentifier", (q) => q.eq("tokenIdentifier", identity.tokenIdentifier))
            .unique();

        if (!user) throw new Error("User not found");

        const match = await ctx.db.get(args.matchId);
        if (!match) throw new Error("Match not found");

        if (match.user2Id !== user._id) {
            throw new Error("Not authorized to reject this request");
        }

        await ctx.db.patch(args.matchId, {
            status: "cancelled", // Or archived/deleted
        });

        // Sync Matches Aggregate - Update to cancelled
        const updatedMatch = await ctx.db.get(args.matchId);
        if (updatedMatch) {
            await matchesAggregate.replace(ctx, match, updatedMatch);
        }

    },
});

// Check if there is an existing match with a specific app (or its owner)
export const getMatchStatus = query({
    args: { appId: v.id("apps") },
    handler: async (ctx, args) => {
        const identity = await ctx.auth.getUserIdentity();
        if (!identity) return null;

        const user = await ctx.db
            .query("users")
            .withIndex("by_tokenIdentifier", (q) =>
                q.eq("tokenIdentifier", identity.tokenIdentifier)
            )
            .unique();

        if (!user) return null;

        const targetApp = await ctx.db.get(args.appId);
        if (!targetApp) return null;

        // Case 1: I am User1 (Requestor), They are User2 (Owner)
        // I requested to test THEIR app (args.appId)
        // So app2Id = args.appId

        console.log(`Checking match status for user ${user._id} and app ${args.appId}`);

        const matchAsRequestor = await ctx.db
            .query("matches")
            .withIndex("by_user1", (q) => q.eq("user1Id", user._id))
            .filter((q) => q.and(
                q.eq(q.field("app2Id"), args.appId),
                q.or(
                    q.eq(q.field("status"), "pending"),
                    q.eq(q.field("status"), "active"),
                    q.eq(q.field("status"), "completed")
                )
            ))
            .first();

        console.log("Match as requestor:", matchAsRequestor);

        if (matchAsRequestor) {
            return {
                matchId: matchAsRequestor._id,
                status: matchAsRequestor.status,
                isRequestor: true,
                myAppId: matchAsRequestor.app1Id
            };
        }

        // Case 2: I am User2 (Target), They are User1 (Requestor)
        // They requested to test MY app? No, wait.
        // If I am viewing THEIR app... I want to swap.
        // If *they* requested *me*... then I am viewing *their* app to accept?
        // If they requested me, then THEY are user1, I am user2.
        // Their app is app1Id. My app is app2Id.
        // So if I am viewing app1Id...

        const matchAsTarget = await ctx.db
            .query("matches")
            .withIndex("by_user2", (q) => q.eq("user2Id", user._id))
            .filter((q) => q.and(
                q.eq(q.field("app1Id"), args.appId),
                q.or(
                    q.eq(q.field("status"), "pending"),
                    q.eq(q.field("status"), "active"),
                    q.eq(q.field("status"), "completed")
                )
            ))
            .first();

        console.log("Match as target:", matchAsTarget);

        if (matchAsTarget) {
            return {
                matchId: matchAsTarget._id,
                status: matchAsTarget.status,
                isRequestor: false,
                myAppId: matchAsTarget.app2Id
            };
        }

    },
});

// Helper to get image URL
const getImageUrl = async (ctx: any, storageId: string | undefined | null) => {
    if (!storageId) return "https://github.com/shadcn.png";
    if (storageId.startsWith("http")) return storageId;
    const url = await ctx.storage.getUrl(storageId);
    return url || "https://github.com/shadcn.png";
};

export const getMyActiveTests = query({
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

        // 1. Matches where I request (user1), so I test app2 (user2's app)
        const myRequests = await ctx.db
            .query("matches")
            .withIndex("by_user1", (q) => q.eq("user1Id", user._id))
            .filter((q) => q.eq(q.field("status"), "active"))
            .collect();

        // 2. Matches where I was requested (user2), so I test app1 (user1's app)
        const requestsToMe = await ctx.db
            .query("matches")
            .withIndex("by_user2", (q) => q.eq("user2Id", user._id))
            .filter((q) => q.eq(q.field("status"), "active"))
            .collect();

        const allActiveMatches = [...myRequests, ...requestsToMe];

        // Collect all unique IDs to fetch
        const appIds = new Set<Id<"apps">>();
        const userIds = new Set<Id<"users">>();

        allActiveMatches.forEach((match) => {
            appIds.add(match.app1Id);
            appIds.add(match.app2Id);
            userIds.add(match.user1Id);
            userIds.add(match.user2Id);
        });

        // Batch fetch Apps (We don't need Users anymore as UI doesn't show partner name)
        const apps = await Promise.all([...appIds].map((id) => ctx.db.get(id)));

        const appMap = new Map<string, any>();
        apps.forEach((a) => {
            if (a) appMap.set(a._id, a);
        });

        // Helper to resolve icon source (prefer storageId for client-side resolution)
        const resolveIconSource = (app: any) => {
            if (!app) return { iconUrl: "https://github.com/shadcn.png" };
            return { iconUrl: app.iconUrl || "https://github.com/shadcn.png" };
        };

        const enrichedMatches = await Promise.all(
            allActiveMatches.map(async (match) => {
                const isRequestor = match.user1Id === user._id;

                // If I am requestor (user1), I test app2, and my app is app1
                // If I am target (user2), I test app1, and my app is app2
                const appToTestId = isRequestor ? match.app2Id : match.app1Id;
                const myAppId = isRequestor ? match.app1Id : match.app2Id;
                const ownerId = isRequestor ? match.user2Id : match.user1Id;

                const appToTest = appMap.get(appToTestId);
                // const myApp = appMap.get(myAppId); 
                // We don't fetch owner anymore to prevent frequent invalidation

                // Calculate current day
                const day = calculateDay(match.startDate || Date.now());

                // OPTIMIZED: Use cached proof status from match object
                const myLastProof = isRequestor ? match.user1LastProof : match.user2LastProof;
                const partnerLastProof = isRequestor ? match.user2LastProof : match.user1LastProof;

                const isMyProofForToday = myLastProof?.day === day;
                const isPartnerProofForToday = partnerLastProof?.day === day;

                const myProofStatus = isMyProofForToday ? (myLastProof?.status || "not_uploaded") : "not_uploaded";
                const partnerProofStatus = isPartnerProofForToday ? (partnerLastProof?.status || "not_uploaded") : "not_uploaded";

                // We don't need the full proof objects anymore for the list view
                // const todayProof = ... (Removed DB call)
                // const partnerProof = ... (Removed DB call)

                const isReviewPending = partnerProofStatus === "pending";
                const needsAttention = myProofStatus !== "approved" || isReviewPending;

                return {
                    id: match._id,
                    name: appToTest?.title || "Unknown App",
                    day,
                    totalDays: 14,
                    myProofStatus,
                    partnerProofStatus,
                    isReviewPending,
                    needsAttention,
                    hasUnread: match.lastActivity > (isRequestor ? (match.lastRead1 || 0) : (match.lastRead2 || 0)),
                    ...resolveIconSource(appToTest)
                };
            })
        );

        // Sort: tasks needing attention first
        return enrichedMatches.sort((a, b) => {
            if (a.needsAttention === b.needsAttention) return 0;
            return a.needsAttention ? -1 : 1;
        });
    },
});


export const getMatchDetails = query({
    args: { matchId: v.id("matches") },
    handler: async (ctx, args) => {
        const identity = await ctx.auth.getUserIdentity();
        if (!identity) return null;

        const user = await ctx.db
            .query("users")
            .withIndex("by_tokenIdentifier", (q) =>
                q.eq("tokenIdentifier", identity.tokenIdentifier)
            )
            .unique();

        if (!user) return null;

        const match = await ctx.db.get(args.matchId);
        if (!match) return null;

        let isTester = false;
        let isOwner = false;
        let appToTestId: Id<"apps">;
        let myAppId: Id<"apps">;
        let ownerId: Id<"users">;

        if (match.user1Id === user._id) {
            isTester = true;
            appToTestId = match.app2Id;
            myAppId = match.app1Id;
            ownerId = match.user2Id;
        } else if (match.user2Id === user._id) {
            isTester = true;
            appToTestId = match.app1Id as Id<"apps">;
            myAppId = match.app2Id as Id<"apps">;
            ownerId = match.user1Id as Id<"users">;
        } else {
            return null; // Not involved
        }

        const appToTest = await ctx.db.get(appToTestId);
        const myApp = await ctx.db.get(myAppId);
        const owner = await ctx.db.get(ownerId);

        let resolvedUrl = appToTest?.iconUrl;
        if (appToTest?.iconUrl && !appToTest.iconUrl.startsWith("http")) {
            resolvedUrl = await getImageUrl(ctx, appToTest.iconUrl);
        }

        // Also fetch App Stats or similar if needed
        // Just return what we need for the dashboard

        // Determine partner (the other user in the match)
        const partnerId = match.user1Id === user._id ? match.user2Id : match.user1Id;
        const partner = await ctx.db.get(partnerId as Id<"users">);

        return {
            match,
            app: {
                title: appToTest?.title,
                iconUrl: resolvedUrl || "https://github.com/shadcn.png",
                packageName: appToTest?.packageName,
                instructions: appToTest?.instructions,
                playStoreUrl: appToTest?.playStoreUrl
            },
            partner: partner ? {
                _id: partner._id,
                name: partner.name,
                email: partner.email,
                avatarUrl: resolveAvatarUrl(partner.avatarUrl)
            } : null,
            startDate: match.startDate,
            day: calculateDay(match.startDate),
            isTester: true,
        };
    }
});

export const getMessages = query({
    args: { matchId: v.id("matches") },
    handler: async (ctx, args) => {
        const identity = await ctx.auth.getUserIdentity();
        if (!identity) return [];

        const messages = await ctx.db
            .query("messages")
            .withIndex("by_matchId", (q) => q.eq("matchId", args.matchId))
            .order("desc") // Get newest first
            .take(100); // Limit to 100

        // Reverse to restore asc order (oldest to newest) for UI
        messages.reverse();

        // Optimized: Removed user fetch. Frontend handles sender name/avatar via header.
        // Frontend derives 'isMe' via senderId check.
        return messages;
    }
});

export const sendMessage = mutation({
    args: {
        matchId: v.id("matches"),
        content: v.string(),
        type: v.union(v.literal("text"), v.literal("image"), v.literal("video")),
        storageId: v.optional(v.string())
    },
    handler: async (ctx, args) => {
        const identity = await ctx.auth.getUserIdentity();
        if (!identity) throw new Error("Auth required");

        const user = await ctx.db
            .query("users")
            .withIndex("by_tokenIdentifier", (q) => q.eq("tokenIdentifier", identity.tokenIdentifier))
            .unique();
        if (!user) throw new Error("User not found");

        const matchData = await ctx.db.get(args.matchId);
        if (!matchData) throw new Error("Match not found");

        await ctx.db.insert("messages", {
            matchId: args.matchId,
            senderId: user._id,
            content: args.content,
            type: args.type,
            storageId: args.storageId,
            sentAt: Date.now()
        });

        // Update match's lastActivity and lastRead for sender
        const now = Date.now();
        if (matchData.user1Id === user._id) {
            await ctx.db.patch(args.matchId, {
                lastActivity: now,
                lastRead1: now
            });
        } else if (matchData.user2Id === user._id) {
            await ctx.db.patch(args.matchId, {
                lastActivity: now,
                lastRead2: now
            });
        }

        // Notify partner about new message
        const partnerId = matchData.user1Id === user._id ? matchData.user2Id : matchData.user1Id;
        await ctx.scheduler.runAfter(0, internal.notificationHelper.createNotification, {
            userId: partnerId,
            type: "message",
            title: "New Message",
            body: `${user.name || "Your partner"} sent you a message`,
            data: { matchId: args.matchId, type: "message" },
        });
    }
});

export const markMessagesAsRead = mutation({
    args: { matchId: v.id("matches") },
    handler: async (ctx, args) => {
        const identity = await ctx.auth.getUserIdentity();
        if (!identity) return;

        const user = await ctx.db
            .query("users")
            .withIndex("by_tokenIdentifier", (q) => q.eq("tokenIdentifier", identity.tokenIdentifier))
            .unique();
        if (!user) return;

        const match = await ctx.db.get(args.matchId);
        if (!match) return;

        const now = Date.now();
        const lastActivity = match.lastActivity || 0;

        if (match.user1Id === user._id) {
            // Only update if there is actually unread activity
            if ((match.lastRead1 || 0) < lastActivity) {
                await ctx.db.patch(args.matchId, { lastRead1: now });
            }
        } else if (match.user2Id === user._id) {
            // Only update if there is actually unread activity
            if ((match.lastRead2 || 0) < lastActivity) {
                await ctx.db.patch(args.matchId, { lastRead2: now });
            }
        }
    }
});

export const getProofs = query({
    args: { matchId: v.id("matches") },
    handler: async (ctx, args) => {
        // Optimized: No user fetch needed for basic listing
        const proofs = await ctx.db
            .query("proofs")
            .withIndex("by_matchId", (q) => q.eq("matchId", args.matchId))
            .collect();

        const proofsWithUrls = await Promise.all(proofs.map(async (p) => {
            // Get all image URLs
            const urls = await Promise.all(
                (p.storageIds || []).map(async (sid) => await getImageUrl(ctx, sid))
            );
            return {
                ...p,
                urls,
                // Removed isMe - frontend will derive from uploaderId
            };
        }));

        return proofsWithUrls;
    }
});

export const uploadProof = mutation({
    args: {
        matchId: v.id("matches"),
        storageIds: v.array(v.string()), // Up to 5 images
        day: v.number(),
        type: v.union(v.literal("image"), v.literal("video")),
        comment: v.optional(v.string())
    },
    handler: async (ctx, args) => {
        const identity = await ctx.auth.getUserIdentity();
        if (!identity) throw new Error("Auth required");

        // Validate max 5 images
        if (args.storageIds.length > 5) {
            throw new Error("Maximum 5 images allowed");
        }
        if (args.storageIds.length === 0) {
            throw new Error("At least 1 image required");
        }

        const user = await ctx.db
            .query("users")
            .withIndex("by_tokenIdentifier", (q) => q.eq("tokenIdentifier", identity.tokenIdentifier))
            .unique();

        if (!user) throw new Error("User not found");

        const match = await ctx.db.get(args.matchId);
        if (!match) throw new Error("Match not found");

        // Check if user already has an approved proof for this day
        const existingApproved = await ctx.db
            .query("proofs")
            .withIndex("by_matchId", (q) => q.eq("matchId", args.matchId))
            .filter((q) => q.and(
                q.eq(q.field("uploaderId"), user._id),
                q.eq(q.field("day"), args.day),
                q.eq(q.field("status"), "approved")
            ))
            .first();

        if (existingApproved) {
            throw new Error("Already approved for this day. Cannot re-upload.");
        }

        // Delete any existing pending/rejected proof for this day (replace)
        const existingProofs = await ctx.db
            .query("proofs")
            .withIndex("by_matchId", (q) => q.eq("matchId", args.matchId))
            .filter((q) => q.and(
                q.eq(q.field("uploaderId"), user._id),
                q.eq(q.field("day"), args.day),
                q.or(
                    q.eq(q.field("status"), "pending"),
                    q.eq(q.field("status"), "rejected")
                )
            ))
            .collect();

        // Delete old proofs for this day
        for (const oldProof of existingProofs) {
            await ctx.db.delete(oldProof._id);
        }

        await ctx.db.insert("proofs", {
            matchId: args.matchId,
            uploaderId: user._id,
            day: args.day,
            type: args.type,
            storageIds: args.storageIds,
            status: "pending",
            comment: args.comment,
            submittedAt: Date.now()
        });

        // Update match cache
        const updateField = match.user1Id === user._id ? "user1LastProof" : "user2LastProof";
        await ctx.db.patch(args.matchId, {
            [updateField]: {
                day: args.day,
                status: "pending",
                updatedAt: Date.now()
            }
        });

        // Notify partner about proof upload
        const matchInfo = await ctx.db.get(args.matchId);
        if (matchInfo) {
            const partnerId = matchInfo.user1Id === user._id ? matchInfo.user2Id : matchInfo.user1Id;
            await ctx.scheduler.runAfter(0, internal.notificationHelper.createNotification, {
                userId: partnerId,
                type: "proof_update",
                title: "Screenshot Uploaded",
                body: `${user.name || "Your partner"} uploaded Day ${args.day} screenshot`,
                data: { matchId: args.matchId, day: args.day },
            });
        }
    }
});

export const reviewProof = mutation({
    args: {
        proofId: v.id("proofs"),
        status: v.union(v.literal("approved"), v.literal("rejected")),
        rejectionReason: v.optional(v.string())
    },
    handler: async (ctx, args) => {
        const identity = await ctx.auth.getUserIdentity();
        if (!identity) throw new Error("Auth required");

        // Require rejection reason if rejecting
        if (args.status === "rejected" && !args.rejectionReason) {
            throw new Error("Rejection reason is required");
        }

        const user = await ctx.db
            .query("users")
            .withIndex("by_tokenIdentifier", (q) => q.eq("tokenIdentifier", identity.tokenIdentifier))
            .unique();
        if (!user) throw new Error("User not found");

        const proof = await ctx.db.get(args.proofId);
        if (!proof) throw new Error("Proof not found");

        const match = await ctx.db.get(proof.matchId);
        if (!match) throw new Error("Match not found");

        if (proof.uploaderId === user._id) {
            throw new Error("Cannot review your own proof");
        }

        if (proof.status !== "pending") {
            throw new Error("Proof has already been reviewed");
        }

        await ctx.db.patch(args.proofId, {
            status: args.status,
            rejectionReason: args.status === "rejected" ? args.rejectionReason : undefined,
            reviewedAt: Date.now()
        });

        // Update match cache
        const updateField = match.user1Id === proof.uploaderId ? "user1LastProof" : "user2LastProof";
        await ctx.db.patch(match._id, {
            [updateField]: {
                day: proof.day,
                status: args.status,
                updatedAt: Date.now()
            }
        });

        if (args.status === "approved") {
            const uploader = await ctx.db.get(proof.uploaderId);
            if (uploader) {
                await ctx.db.patch(uploader._id, {
                    reputation: (uploader.reputation || 100) + 1
                });
            }
        } else if (args.status === "rejected") {
            const uploader = await ctx.db.get(proof.uploaderId);
            if (uploader) {
                await ctx.db.patch(uploader._id, {
                    reputation: Math.max(0, (uploader.reputation || 100) - 5)
                });
            }
            // Clear storageIds since we deleted them (or intend to overwrite them)
            await ctx.db.patch(proof._id, {
                storageIds: []
            });
        }

        // Notify the uploader
        await ctx.scheduler.runAfter(0, internal.notificationHelper.createNotification, {
            userId: proof.uploaderId,
            type: "proof_update",
            title: args.status === "approved" ? "Proof Approved!" : "Proof Rejected",
            body: args.status === "approved"
                ? `Your Day ${proof.day} proof was approved!`
                : `Your Day ${proof.day} proof was rejected: ${args.rejectionReason}`,
            data: { matchId: proof.matchId, proofId: proof._id },
        });
    }
});



// Get current user's proof for today
export const getTodayProof = query({
    args: { matchId: v.id("matches") },
    handler: async (ctx, args) => {
        const identity = await ctx.auth.getUserIdentity();
        if (!identity) return null;

        const user = await ctx.db
            .query("users")
            .withIndex("by_tokenIdentifier", (q) =>
                q.eq("tokenIdentifier", identity.tokenIdentifier)
            )
            .unique();

        if (!user) return null;

        const match = await ctx.db.get(args.matchId);
        if (!match) return null;

        const day = calculateDay(match.startDate);

        // Find user's proof for today
        // OPTIMIZED: Use by_uploader_day index
        const todayProof = await ctx.db
            .query("proofs")
            .withIndex("by_uploader_day", (q) =>
                q.eq("uploaderId", user._id)
                    .eq("matchId", args.matchId)
                    .eq("day", day)
            )
            .first();

        if (!todayProof) {
            return {
                day,
                status: "not_uploaded" as const,
                canUpload: true
            };
        }

        // Get image URLs
        const urls = await Promise.all(
            (todayProof.storageIds || []).map(async (sid) => {
                if (sid.startsWith("http")) return sid;
                const url = await ctx.storage.getUrl(sid);
                return url || "";
            })
        );

        return {
            ...todayProof,
            day,
            urls,
            canUpload: todayProof.status !== "approved",
            canEdit: todayProof.status === "pending"
        };
    }
});

// Get partner's proof for today (any status)
export const getPartnerTodayProof = query({
    args: { matchId: v.id("matches") },
    handler: async (ctx, args) => {
        const identity = await ctx.auth.getUserIdentity();
        if (!identity) return null;

        const user = await ctx.db
            .query("users")
            .withIndex("by_tokenIdentifier", (q) =>
                q.eq("tokenIdentifier", identity.tokenIdentifier)
            )
            .unique();

        if (!user) return null;

        const match = await ctx.db.get(args.matchId);
        if (!match) return null;

        // Get partner ID
        const partnerId = match.user1Id === user._id ? match.user2Id : match.user1Id;
        const partner = await ctx.db.get(partnerId);

        const day = calculateDay(match.startDate);

        // Find partner's proof for today (any status)
        // OPTIMIZED: Use by_uploader_day index
        const partnerProof = await ctx.db
            .query("proofs")
            .withIndex("by_uploader_day", (q) =>
                q.eq("uploaderId", partnerId)
                    .eq("matchId", args.matchId)
                    .eq("day", day)
            )
            .first();

        if (!partnerProof) {
            return {
                day,
                status: "not_uploaded" as const,
                hasPending: false,
                partnerName: partner?.name || "Partner"
            };
        }

        // Get image URLs
        const urls = await Promise.all(
            (partnerProof.storageIds || []).map(async (sid) => {
                if (sid.startsWith("http")) return sid;
                const url = await ctx.storage.getUrl(sid);
                return url || "";
            })
        );

        return {
            ...partnerProof,
            day,
            urls,
            hasPending: partnerProof.status === "pending",
            partnerName: partner?.name || "Partner"
        };
    }
});

// Get both users' proofs for a specific day with image URLs (for viewing previous day screenshots)
export const getProofForDay = query({
    args: {
        matchId: v.id("matches"),
        day: v.number()
    },
    handler: async (ctx, args) => {
        const identity = await ctx.auth.getUserIdentity();
        if (!identity) return null;

        const user = await ctx.db
            .query("users")
            .withIndex("by_tokenIdentifier", (q) =>
                q.eq("tokenIdentifier", identity.tokenIdentifier)
            )
            .unique();

        if (!user) return null;

        const match = await ctx.db.get(args.matchId);
        if (!match) return null;

        // Validate user is part of this match
        if (match.user1Id !== user._id && match.user2Id !== user._id) {
            return null;
        }

        const partnerId = match.user1Id === user._id ? match.user2Id : match.user1Id;
        const partner = await ctx.db.get(partnerId);

        const currentDay = calculateDay(match.startDate);

        // Get my proof for this day
        const myProof = await ctx.db
            .query("proofs")
            .withIndex("by_matchId", (q) => q.eq("matchId", args.matchId))
            .filter((q) => q.and(
                q.eq(q.field("uploaderId"), user._id),
                q.eq(q.field("day"), args.day)
            ))
            .first();

        // Get partner's proof for this day
        const partnerProof = await ctx.db
            .query("proofs")
            .withIndex("by_matchId", (q) => q.eq("matchId", args.matchId))
            .filter((q) => q.and(
                q.eq(q.field("uploaderId"), partnerId),
                q.eq(q.field("day"), args.day)
            ))
            .first();

        // Helper to get image URLs
        const getUrls = async (storageIds: string[] | undefined) => {
            if (!storageIds || storageIds.length === 0) return [];
            return Promise.all(
                storageIds.map(async (sid) => {
                    if (sid.startsWith("http")) return sid;
                    const url = await ctx.storage.getUrl(sid);
                    return url || "";
                })
            );
        };

        const myUrls = myProof ? await getUrls(myProof.storageIds) : [];
        const partnerUrls = partnerProof ? await getUrls(partnerProof.storageIds) : [];

        return {
            day: args.day,
            currentDay,
            isFuture: args.day > currentDay,
            isToday: args.day === currentDay,
            myProof: myProof ? {
                _id: myProof._id,
                status: myProof.status,
                urls: myUrls,
                comment: myProof.comment,
                rejectionReason: myProof.rejectionReason,
                submittedAt: myProof.submittedAt,
                reviewedAt: myProof.reviewedAt
            } : null,
            partnerProof: partnerProof ? {
                _id: partnerProof._id,
                status: partnerProof.status,
                urls: partnerUrls,
                comment: partnerProof.comment,
                submittedAt: partnerProof.submittedAt,
                reviewedAt: partnerProof.reviewedAt
            } : null,
            partnerName: partner?.name || "Partner",
            userName: user.name || "You"
        };
    }
});

// Get full 14-day progress data for both users
export const getProgressData = query({
    args: { matchId: v.id("matches") },
    handler: async (ctx, args) => {
        const match = await ctx.db.get(args.matchId);
        if (!match) return null;

        const currentDay = calculateDay(match.startDate);

        // Get all proofs for this match
        const allProofs = await ctx.db
            .query("proofs")
            .withIndex("by_matchId", (q) => q.eq("matchId", args.matchId))
            .collect();

        // Group proofs by day and user
        const myProofs = allProofs.filter(p => p.uploaderId === match.user1Id || p.uploaderId === match.user2Id);
        // Note: Logic below assumes we know who "me" is. 
        // BUT, since we want to avoid checking identity (to avoid user dependency), we need to return raw data.
        // Actually, for "myStatus" vs "partnerStatus", we DO need to know who the caller is.
        // However, we can simply return data keyed by userId, OR simpler:
        // We MUST know who the caller is to assign "my" vs "partner".
        // But we DO NOT need to fetch the full USER object. Just `ctx.auth.getUserIdentity()` token is enough.

        const identity = await ctx.auth.getUserIdentity();
        if (!identity) return null;

        // We need to map tokenIdentifier -> userId. Unfortunately, `match` only has userIds.
        // So we DO need to fetch at least OUR user doc to get our _id.
        // Optimization: Fetch ONLY _id using a focused query if possible, or just accept this one read.
        // The expensive part was fetching Partner, MyApp, PartnerApp etc.

        const user = await ctx.db
            .query("users")
            .withIndex("by_tokenIdentifier", (q) => q.eq("tokenIdentifier", identity.tokenIdentifier))
            .unique();

        if (!user) return null;

        const partnerId = match.user1Id === user._id ? match.user2Id : match.user1Id;

        const userProofs = allProofs.filter(p => p.uploaderId === user._id);
        const partnerProofs = allProofs.filter(p => p.uploaderId === partnerId);

        // Build 14-day grid
        const days = [];
        for (let day = 1; day <= 14; day++) {
            const myProofForDay = userProofs.find(p => p.day === day);
            const partnerProofForDay = partnerProofs.find(p => p.day === day);

            const isFutureDay = day > currentDay;

            days.push({
                day,
                isFuture: isFutureDay,
                isToday: day === currentDay,
                myStatus: isFutureDay ? "future" : (myProofForDay?.status || (day === currentDay ? "pending" : "missed")),
                partnerStatus: isFutureDay ? "future" : (partnerProofForDay?.status || (day === currentDay ? "pending" : "missed")),
                myProof: myProofForDay ? {
                    status: myProofForDay.status,
                    comment: myProofForDay.comment,
                    rejectionReason: myProofForDay.rejectionReason,
                    submittedAt: myProofForDay.submittedAt
                } : null,
                partnerProof: partnerProofForDay ? {
                    status: partnerProofForDay.status,
                    comment: partnerProofForDay.comment,
                    submittedAt: partnerProofForDay.submittedAt
                } : null
            });
        }

        // Calculate summary stats
        const myApprovedCount = userProofs.filter(p => p.status === "approved").length;
        const partnerApprovedCount = partnerProofs.filter(p => p.status === "approved").length;
        const myPendingCount = userProofs.filter(p => p.status === "pending").length;
        const partnerPendingCount = partnerProofs.filter(p => p.status === "pending").length;

        return {
            days,
            currentDay: currentDay > 14 ? 14 : currentDay,
            summary: {
                myApproved: myApprovedCount,
                partnerApproved: partnerApprovedCount,
                myPending: myPendingCount,
                partnerPending: partnerPendingCount,
                totalDays: 14
            },
            // Removed redundant partnerName, myAppName, partnerAppName
        };
    }
});

export const getAppTesters = query({
    args: { appId: v.id("apps") },
    handler: async (ctx, args) => {
        const identity = await ctx.auth.getUserIdentity();
        const user = identity ? await ctx.db
            .query("users")
            .withIndex("by_tokenIdentifier", (q) => q.eq("tokenIdentifier", identity.tokenIdentifier))
            .unique() : null;

        const app = await ctx.db.get(args.appId);
        if (!app) return [];

        // Use indexes for faster lookup, then filter in memory for active status
        const matchesAsApp1 = await ctx.db
            .query("matches")
            .withIndex("by_app1", (q) => q.eq("app1Id", args.appId))
            .collect();

        const matchesAsApp2 = await ctx.db
            .query("matches")
            .withIndex("by_app2", (q) => q.eq("app2Id", args.appId))
            .collect();

        // Filter for active matches in memory (much cheaper than filter() in query)
        const allMatches = [...matchesAsApp1, ...matchesAsApp2].filter(m => m.status === "active");

        return await Promise.all(allMatches.map(async (match) => {
            const isApp1 = match.app1Id === args.appId;
            const testerId = isApp1 ? match.user2Id : match.user1Id;
            const tester = await ctx.db.get(testerId);

            // Calculate current day
            const day = calculateDay(match.startDate || Date.now());

            // OPTIMIZED: Use cached proof status from match object
            const isUser1Tester = match.user1Id === testerId;
            const testerLastProof = isUser1Tester ? match.user1LastProof : match.user2LastProof;

            const uploadedToday = testerLastProof?.day === day;
            const status = uploadedToday ? (testerLastProof?.status || "pending") : "pending";

            // Removed DB query for proof

            const isUser1 = match.user1Id === user?._id;
            const lastRead = isUser1 ? (match.lastRead1 || 0) : (match.lastRead2 || 0);
            const hasUnread = (match.lastActivity || 0) > lastRead;

            return {
                matchId: match._id,
                testerName: tester?.name || "Unknown",
                testerAvatar: resolveAvatarUrl(tester?.avatarUrl),
                day,
                status,
                uploadedToday,
                hasUnread,
                testerEmail: tester?.email
            };
        }));
    }
});

// Cleanup: Delete messages older than 14 days
export const deleteOldMessages = internalMutation({
    args: {},
    handler: async (ctx) => {
        const FOURTEEN_DAYS_MS = 14 * 24 * 60 * 60 * 1000;
        const cutoffTime = Date.now() - FOURTEEN_DAYS_MS;

        const oldMessages = await ctx.db
            .query("messages")
            .filter((q) => q.lt(q.field("sentAt"), cutoffTime))
            .collect();

        for (const msg of oldMessages) {
            await ctx.db.delete(msg._id);
        }

        console.log(`Deleted ${oldMessages.length} old messages`);
    },
});

export const cancelMatch = mutation({
    args: { matchId: v.id("matches") },
    handler: async (ctx, args) => {
        const identity = await ctx.auth.getUserIdentity();
        if (!identity) throw new Error("Not authenticated");

        const user = await ctx.db
            .query("users")
            .withIndex("by_tokenIdentifier", (q) => q.eq("tokenIdentifier", identity.tokenIdentifier))
            .unique();

        if (!user) throw new Error("User not found");

        const match = await ctx.db.get(args.matchId);
        if (!match) throw new Error("Match not found");

        if (match.user1Id !== user._id && match.user2Id !== user._id) {
            throw new Error("Not authorized");
        }

        const wasActive = match.status === "active";

        await ctx.db.patch(args.matchId, { status: "cancelled" });

        // Decrement currentTesters if the match was active
        const updateAppCounter = async (appId: Id<"apps">) => {
            const app = await ctx.db.get(appId);
            if (app && wasActive) {
                const newCount = Math.max(0, (app.currentTesters || 0) - 1);
                const newStatus = newCount < app.requiredTesters && app.status === "filled"
                    ? "recruiting"
                    : app.status;
                await ctx.db.patch(appId, {
                    currentTesters: newCount,
                    status: newStatus,

                });
            }
        };

        await updateAppCounter(match.app1Id);
        await updateAppCounter(match.app2Id);
    }
});


// Scheduled Job to check for missed penalties
export const checkMissedPenalties = internalMutation({
    args: {},
    handler: async (ctx) => {
        // Run this daily shortly after midnight IST to check the PREVIOUS day.
        // E.g. Run at 12:30 AM IST (19:00 UTC previous day).

        // We want to check for Day X-1.
        // Let's recalculate "Current Day" based on NOW.
        // If we run at 12:30 AM IST on "Day 5", current day is 5. We want to check Day 4.

        // 1. Get all ACTIVE matches
        const matches = await ctx.db
            .query("matches")
            .filter((q) => q.eq(q.field("status"), "active"))
            .collect();

        let penaltyCount = 0;

        for (const match of matches) {
            // Calculate CURRENT DAY for this match
            // If match started 5 days ago, calculateDay returns 5.
            const currentDayOfMatch = calculateDay(match.startDate);

            // We check the day that JUST finished, i.e., currentDay - 1
            const dayToCheck = currentDayOfMatch - 1;

            if (dayToCheck < 1) continue; // Match just started today, nothing to check
            if (dayToCheck === 1) continue; // Grace period: No penalty for Day 1 (user may have joined late)

            // Users to check
            const userIds = [match.user1Id, match.user2Id];

            for (const userId of userIds) {
                // Check if they uploaded for dayToCheck
                const proof = await ctx.db
                    .query("proofs")
                    .withIndex("by_matchId", (q) => q.eq("matchId", match._id))
                    .filter((q) => q.and(
                        q.eq(q.field("uploaderId"), userId),
                        q.eq(q.field("day"), dayToCheck)
                    ))
                    .first();

                // If NO proof exists (or status is not approved? No, just if they completely missed uploading)
                // "Missed" usually means didn't upload. If they uploaded and it's rejected, they already got -5.
                // We don't want to double penalize.

                if (!proof) {
                    // PENALIZE
                    const user = await ctx.db.get(userId);
                    if (user) {
                        // Deduct 3 points, min 0
                        await ctx.db.patch(user._id, {
                            reputation: Math.max(0, (user.reputation || 100) - 3)
                        });

                        // Notify
                        await ctx.scheduler.runAfter(0, internal.notificationHelper.createNotification, {
                            userId: userId,
                            type: "alert",
                            title: "Missed Day Penalty",
                            body: `You missed Day ${dayToCheck}. -3 Reputation.`,
                            data: { matchId: match._id }
                        });

                        penaltyCount++;
                    }
                }
            }
        }

        console.log(`Checked penalties. Penalized ${penaltyCount} users.`);
    }
});


// Delete proof DATABASE ROWS older than 20 days (stats already saved in matches table)
export const cleanupOldProofRows = internalMutation({
    args: {},
    handler: async (ctx) => {
        const TWENTY_DAYS_MS = 20 * 24 * 60 * 60 * 1000;
        const cutoffDate = Date.now() - TWENTY_DAYS_MS;

        // Get all proofs older than 20 days
        const oldProofs = await ctx.db
            .query("proofs")
            .filter((q) => q.lt(q.field("submittedAt"), cutoffDate))
            .collect();

        let deletedCount = 0;

        for (const proof of oldProofs) {
            // Double check the match is completed before deleting
            const match = await ctx.db.get(proof.matchId);
            if (match && match.status === "completed") {
                await ctx.db.delete(proof._id);
                deletedCount++;
            }
        }

        console.log(`Cleaned up ${deletedCount} old proof rows (> 20 days old from completed matches).`);
        return { deletedCount };
    }
});

// Delete cancelled MATCH ROWS older than 7 days (and their proofs/messages)
export const cleanupCancelledMatches = internalMutation({
    args: {},
    handler: async (ctx) => {
        const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;
        const cutoffDate = Date.now() - SEVEN_DAYS_MS;

        // Get cancelled matches older than 7 days
        const cancelledMatches = await ctx.db
            .query("matches")
            .withIndex("by_status", (q) => q.eq("status", "cancelled"))
            .collect();

        let deletedMatches = 0;
        let deletedProofs = 0;

        for (const match of cancelledMatches) {
            // Delete proofs
            const proofs = await ctx.db
                .query("proofs")
                .withIndex("by_matchId", (q) => q.eq("matchId", match._id))
                .collect();

            for (const proof of proofs) {
                await ctx.db.delete(proof._id);
                deletedProofs++;
            }

            // Delete messages
            const messages = await ctx.db
                .query("messages")
                .withIndex("by_matchId", (q) => q.eq("matchId", match._id))
                .collect();

            for (const msg of messages) {
                await ctx.db.delete(msg._id);
            }

            // Delete match
            await ctx.db.delete(match._id);
            deletedMatches++;
        }

        console.log(`Cleaned up ${deletedMatches} cancelled matches and ${deletedProofs} proofs.`);
    }
});

// Check for users who haven't uploaded proofs for 2 consecutive days
export const checkAppOwnerInactivity = internalMutation({
    args: {},
    handler: async (ctx) => {
        // Get all active matches
        const activeMatches = await ctx.db
            .query("matches")
            .withIndex("by_status", (q) => q.eq("status", "active"))
            .collect();

        const slackers = new Set<Id<"users">>();

        for (const match of activeMatches) {
            const currentDay = calculateDay(match.startDate);
            // Grace period: allow first 2 days to pass
            if (currentDay < 3) continue;

            const daysToCheck = [currentDay - 1, currentDay - 2];

            // Get proofs for this match efficiently
            const proofs = await ctx.db
                .query("proofs")
                .withIndex("by_matchId", (q) => q.eq("matchId", match._id))
                .collect();

            // Check both users
            const usersInfo = [
                { id: match.user1Id, role: "user1" },
                { id: match.user2Id, role: "user2" }
            ];

            for (const user of usersInfo) {
                // Check if user missed BOTH days
                const missedBoth = daysToCheck.every(day => {
                    const hasProof = proofs.some(p => p.uploaderId === user.id && p.day === day);
                    return !hasProof;
                });

                if (missedBoth) {
                    console.log(`User ${user.id} missed uploads for days ${daysToCheck.join(", ")} in match ${match._id}`);
                    slackers.add(user.id);
                }
            }
        }

        console.log(`Found ${slackers.size} inactive users (missed 2 days consecutively).`);

        for (const userId of slackers) {
            console.log(`Penalizing user ${userId} for inactivity...`);

            // Notify Slacker
            await ctx.scheduler.runAfter(0, internal.notificationHelper.createNotification, {
                userId: userId,
                type: "message",
                title: "⚠️ Inactivity Penalty",
                body: "You missed uploading screenshots for 2 consecutive days. Your apps have been archived and matches cancelled.",
                data: { type: "penalty" }
            });

            // 1. Mark user to see popup
            await ctx.db.patch(userId, { showDeletionPopup: true });

            // 2. Archive their apps
            const apps = await ctx.db
                .query("apps")
                .withIndex("by_userId", (q) => q.eq("userId", userId))
                .collect();

            for (const app of apps) {
                if (app.status !== "archived" && app.status !== "completed") {
                    await ctx.db.patch(app._id, { status: "archived" });
                }
            }

            // 3. Cancel ALL their matches (both as user1 and user2)
            const matchesAsUser1 = await ctx.db
                .query("matches")
                .withIndex("by_user1", (q) => q.eq("user1Id", userId))
                .collect();

            const matchesAsUser2 = await ctx.db
                .query("matches")
                .withIndex("by_user2", (q) => q.eq("user2Id", userId))
                .collect();

            const allUserMatches = [...matchesAsUser1, ...matchesAsUser2];

            for (const m of allUserMatches) {
                if (m.status === "active" || m.status === "pending") {
                    await ctx.db.patch(m._id, { status: "cancelled" });

                    // Notify Partner (if active match)
                    if (m.status === "active") {
                        const partnerId = m.user1Id === userId ? m.user2Id : m.user1Id;
                        await ctx.scheduler.runAfter(0, internal.notificationHelper.createNotification, {
                            userId: partnerId,
                            type: "message",
                            title: "Match Cancelled",
                            body: "This match was cancelled because your partner was inactive for 2 consecutive days.",
                            data: { matchId: m._id, type: "match_cancelled" }
                        });
                    }
                }
            }
        }
    }
});


// Helper to calculate raw day (without capping at 14) for completion check
const calculateRawDay = (startDate: number) => {
    if (!startDate) return 1;
    const IST_OFFSET = 5.5 * 60 * 60 * 1000;
    const DAY_MS = 24 * 60 * 60 * 1000;
    const startDay = Math.floor((startDate + IST_OFFSET) / DAY_MS);
    const today = Math.floor((Date.now() + IST_OFFSET) / DAY_MS);
    return today - startDay + 1;
};

// Auto-complete matches that have finished 14 days (runs on Day 15+)
export const autoCompleteMatches = internalMutation({
    args: {},
    handler: async (ctx) => {
        // Find all active matches
        const activeMatches = await ctx.db
            .query("matches")
            .withIndex("by_status", (q) => q.eq("status", "active"))
            .collect();

        let completedCount = 0;

        for (const match of activeMatches) {
            const rawDay = calculateRawDay(match.startDate);

            // Only complete matches on Day 15+ (after Day 14 testing is done)
            if (rawDay < 15) continue;

            // Get all proofs for this match
            const proofs = await ctx.db
                .query("proofs")
                .withIndex("by_matchId", (q) => q.eq("matchId", match._id))
                .collect();

            // Count approved proofs for each user
            const user1ApprovedCount = proofs.filter(
                p => p.uploaderId === match.user1Id && p.status === "approved"
            ).length;
            const user2ApprovedCount = proofs.filter(
                p => p.uploaderId === match.user2Id && p.status === "approved"
            ).length;

            // Update match status to completed
            await ctx.db.patch(match._id, {
                status: "completed",
                completedAt: Date.now(),
                user1ApprovedCount,
                user2ApprovedCount
            });

            // Get app names for notification
            const app1 = await ctx.db.get(match.app1Id);
            const app2 = await ctx.db.get(match.app2Id);

            // Send completion notification to User 1
            await ctx.scheduler.runAfter(0, internal.notificationHelper.createNotification, {
                userId: match.user1Id,
                type: "proof_update",
                title: "🎉 14-Day Testing Complete!",
                body: `You completed testing ${app2?.title || "the app"} with ${user1ApprovedCount}/14 proofs approved!`,
                data: { matchId: match._id, type: "match_completed" }
            });

            // Send completion notification to User 2
            await ctx.scheduler.runAfter(0, internal.notificationHelper.createNotification, {
                userId: match.user2Id,
                type: "proof_update",
                title: "🎉 14-Day Testing Complete!",
                body: `You completed testing ${app1?.title || "the app"} with ${user2ApprovedCount}/14 proofs approved!`,
                data: { matchId: match._id, type: "match_completed" }
            });

            completedCount++;
        }

        console.log(`Auto-completed ${completedCount} matches that finished 14 days.`);
    }
});

// Get completed matches for current user
export const getCompletedMatches = query({
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

        if (!user) return [];

        // OPTIMIZED: Query specific matches for this user only
        const matches1 = await ctx.db
            .query("matches")
            .withIndex("by_user1", (q) => q.eq("user1Id", user._id))
            .filter(q => q.eq(q.field("status"), "completed"))
            .collect();

        const matches2 = await ctx.db
            .query("matches")
            .withIndex("by_user2", (q) => q.eq("user2Id", user._id))
            .filter(q => q.eq(q.field("status"), "completed"))
            .collect();

        const myCompletedMatches = [...matches1, ...matches2];

        // Enrich with partner and app details
        const enrichedMatches = await Promise.all(
            myCompletedMatches.map(async (match) => {
                const isUser1 = match.user1Id === user._id;
                const partnerId = isUser1 ? match.user2Id : match.user1Id;
                const myAppId = isUser1 ? match.app1Id : match.app2Id;
                const partnerAppId = isUser1 ? match.app2Id : match.app1Id;

                const partner = await ctx.db.get(partnerId);
                const partnerApp = await ctx.db.get(partnerAppId);
                const myApp = await ctx.db.get(myAppId);

                const myApprovedCount = isUser1 ? match.user1ApprovedCount : match.user2ApprovedCount;
                const partnerApprovedCount = isUser1 ? match.user2ApprovedCount : match.user1ApprovedCount;

                return {
                    id: match._id,
                    partnerName: partner?.name || "Partner",
                    partnerAvatar: resolveAvatarUrl(partner?.avatarUrl),
                    appName: partnerApp?.title || "App",
                    appIconUrl: partnerApp?.iconUrl,
                    myAppName: myApp?.title || "My App",
                    completedAt: match.completedAt,
                    myApprovedCount: myApprovedCount || 0,
                    partnerApprovedCount: partnerApprovedCount || 0,
                    totalDays: 14
                };
            })
        );

        // Sort by completedAt (newest first)
        return enrichedMatches.sort((a, b) => (b.completedAt || 0) - (a.completedAt || 0));
    }
});

// Get simple status map of all matches for the current user (for Marketplace badges)
export const getMyMatchStatuses = query({
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

        // Get all matches involving this user
        const matches1 = await ctx.db
            .query("matches")
            .withIndex("by_user1", (q) => q.eq("user1Id", user._id))
            .collect();

        const matches2 = await ctx.db
            .query("matches")
            .withIndex("by_user2", (q) => q.eq("user2Id", user._id))
            .collect();

        const allMatches = [...matches1, ...matches2];

        // Map to { appId: status }
        // We want the ID of the OTHER app (the one I'm viewing in marketplace)
        return allMatches
            .filter(m => m.status === 'active' || m.status === 'pending')
            .map(m => {
                const isUser1 = m.user1Id === user._id;
                // If I am User1, "Other App" is App2.
                // If I am User2, "Other App" is App1.
                const partnerAppId = isUser1 ? m.app2Id : m.app1Id;

                let status: string = m.status; // 'active' or 'pending'
                if (status === 'pending') {
                    // Differentiate sent vs received
                    // If I am User1 (Requestor), it's "sent"
                    status = isUser1 ? 'pending_sent' : 'pending_received';
                }

                return {
                    appId: partnerAppId,
                    status
                };
            });
    }
});

export const backfillMatchProofStatus = mutation({
    args: {},
    handler: async (ctx) => {
        const matches = await ctx.db.query("matches").collect();
        let count = 0;

        for (const match of matches) {
            // Find latest proof for User 1
            const proof1 = await ctx.db
                .query("proofs")
                .withIndex("by_uploader_day", (q) => q.eq("uploaderId", match.user1Id).eq("matchId", match._id))
                .order("desc")
                .first();

            // Find latest proof for User 2
            const proof2 = await ctx.db
                .query("proofs")
                .withIndex("by_uploader_day", (q) => q.eq("uploaderId", match.user2Id).eq("matchId", match._id))
                .order("desc")
                .first();

            const updates: any = {};

            if (proof1) {
                updates.user1LastProof = {
                    day: proof1.day,
                    status: proof1.status,
                    updatedAt: proof1.submittedAt || Date.now()
                };
            }

            if (proof2) {
                updates.user2LastProof = {
                    day: proof2.day,
                    status: proof2.status,
                    updatedAt: proof2.submittedAt || Date.now()
                };
            }

            if (Object.keys(updates).length > 0) {
                await ctx.db.patch(match._id, updates);
                count++;
            }
        }

        return `Updated ${count} matches`;
    }
});


