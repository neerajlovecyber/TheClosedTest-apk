import { ConvexError, v } from "convex/values";
import { mutation, query, internalMutation, internalQuery, internalAction } from "./_generated/server";
import { Id } from "./_generated/dataModel";
import { api, internal } from "./_generated/api";

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
            await ctx.db.patch(myApp._id, { status: "filled", updatedAt: Date.now() });
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
            await ctx.db.patch(targetApp._id, { status: "filled", updatedAt: Date.now() });
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
        const requests = await ctx.db
            .query("matches")
            .withIndex("by_user2", (q) => q.eq("user2Id", user._id))
            .filter((q) => q.eq(q.field("status"), "pending"))
            .collect();

        // Enrich data
        const enrichedRequests = await Promise.all(
            requests.map(async (match) => {
                const requestor = await ctx.db.get(match.user1Id);
                const offeredApp = await ctx.db.get(match.app1Id); // App they will test for me (Wait, app1Id is THEIR app they offered)
                // Correction: app1Id is Requestor's App (that *I* will defineatly have to test if I accept)
                // app2Id is MY App (that *they* will test)

                const myAppToCheck = await ctx.db.get(match.app2Id);

                return {
                    ...match,
                    requestor,
                    offeredApp, // App I will have to test
                    myApp: myAppToCheck, // App they want to test
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
                await ctx.db.patch(app1._id, { status: "filled", currentTesters: app1ActiveCount, updatedAt: Date.now() });
                throw new ConvexError(`${app1.title} already has enough testers`);
            }
        }

        if (app2) {
            const app2ActiveCount = await countActiveTesters(app2._id);
            if (app2ActiveCount >= app2.requiredTesters) {
                await ctx.db.patch(app2._id, { status: "filled", currentTesters: app2ActiveCount, updatedAt: Date.now() });
                throw new ConvexError(`${app2.title} already has enough testers`);
            }
        }

        // Accept the match
        await ctx.db.patch(args.matchId, {
            status: "active",
            startDate: Date.now(),
            lastActivity: Date.now(),
        });

        // Update both apps' currentTesters and status
        if (app1) {
            const newCount = (app1.currentTesters || 0) + 1;
            const newStatus = newCount >= app1.requiredTesters ? "filled" : app1.status;
            await ctx.db.patch(app1._id, {
                currentTesters: newCount,
                status: newStatus === "recruiting" || newStatus === "filled" ? newStatus : app1.status,
                updatedAt: Date.now()
            });
        }

        if (app2) {
            const newCount = (app2.currentTesters || 0) + 1;
            const newStatus = newCount >= app2.requiredTesters ? "filled" : app2.status;
            await ctx.db.patch(app2._id, {
                currentTesters: newCount,
                status: newStatus === "recruiting" || newStatus === "filled" ? newStatus : app2.status,
                updatedAt: Date.now()
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

        const enrichedMatches = await Promise.all(
            allActiveMatches.map(async (match) => {
                const isRequestor = match.user1Id === user._id;

                // If I am requestor (user1), I test app2, and my app is app1
                // If I am target (user2), I test app1, and my app is app2
                const appToTestId = isRequestor ? match.app2Id : match.app1Id;
                const myAppId = isRequestor ? match.app1Id : match.app2Id;
                const ownerId = isRequestor ? match.user2Id : match.user1Id;

                const appToTest = await ctx.db.get(appToTestId);
                const myApp = await ctx.db.get(myAppId);
                const owner = await ctx.db.get(ownerId);

                // Calculate current day
                const day = calculateDay(match.startDate || Date.now());

                // Check if user has uploaded proof for today and if it's approved
                const todayProof = await ctx.db
                    .query("proofs")
                    .withIndex("by_matchId", (q) => q.eq("matchId", match._id))
                    .filter((q) => q.and(
                        q.eq(q.field("uploaderId"), user._id),
                        q.eq(q.field("day"), day)
                    ))
                    .first();

                let resolvedUrl = appToTest?.iconUrl;
                if (appToTest?.storageIconId) {
                    resolvedUrl = await getImageUrl(ctx, appToTest.storageIconId);
                } else if (appToTest?.iconUrl && !appToTest.iconUrl.startsWith("http")) {
                    resolvedUrl = await getImageUrl(ctx, appToTest.iconUrl);
                }

                // Check partner's proof status
                const partnerProof = await ctx.db
                    .query("proofs")
                    .withIndex("by_matchId", (q) => q.eq("matchId", match._id))
                    .filter((q) => q.and(
                        q.eq(q.field("uploaderId"), ownerId),
                        q.eq(q.field("day"), day)
                    ))
                    .first();

                const myProofStatus = todayProof?.status || "not_uploaded";
                const partnerProofStatus = partnerProof?.status || "not_uploaded";

                // Needs review if partner uploaded and it's pending review from me
                // Note: I am the "reviewer" for the app I am testing?
                // Wait.
                // Requestor (User 1) tests App 2 (owned by User 2).
                // Proofs are uploaded by the tester.
                // So I upload proof for App 2. Owner (User 2) reviews it.
                // User 2 uploads proof for App 1 (my app). I review it.

                // So 'partnerProof' here refers to the proof uploaded by the partner for MY app (App 1 if I am User 1).
                // I need to review 'partnerProof'.
                const isReviewPending = partnerProofStatus === "pending";

                // If proof is approved, task is complete for today - don't show
                // BUT also show if I need to review partner's proof
                const needsAttention = (!todayProof || todayProof.status !== "approved") || isReviewPending;

                const lastRead = isRequestor ? (match.lastRead1 || 0) : (match.lastRead2 || 0);
                const hasUnread = (match.lastActivity || 0) > lastRead;

                return {
                    id: match._id,
                    name: appToTest?.title || "Unknown App",
                    status: match.status,
                    startDate: match.startDate,
                    day,
                    totalDays: 14,
                    owner: owner?.name || "Unknown User",
                    relatedMyApp: myApp?.title || "My App",
                    iconUrl: resolvedUrl || "https://github.com/shadcn.png",
                    needsAttention,
                    myProofStatus,
                    partnerProofStatus,
                    isReviewPending,
                    hasUnread
                };
            })
        );

        // Return all active matches (UI will split into pending/completed)
        return enrichedMatches;
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
        if (appToTest?.storageIconId) {
            resolvedUrl = await getImageUrl(ctx, appToTest.storageIconId);
        } else if (appToTest?.iconUrl && !appToTest.iconUrl.startsWith("http")) {
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
                ...appToTest,
                iconUrl: resolvedUrl || "https://github.com/shadcn.png"
            },
            owner, // This is the owner of the app being tested
            partner: partner ? {
                ...partner,
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
            .order("asc")
            .collect();

        const messagesWithSender = await Promise.all(
            messages.map(async (msg) => {
                const sender = await ctx.db.get(msg.senderId);
                return {
                    ...msg,
                    senderName: sender?.name || "Unknown",
                    senderAvatar: resolveAvatarUrl(sender?.avatarUrl),
                    isMe: sender?.tokenIdentifier === identity.tokenIdentifier
                };
            })
        );
        return messagesWithSender;
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
        if (match.user1Id === user._id) {
            await ctx.db.patch(args.matchId, { lastRead1: now });
        } else if (match.user2Id === user._id) {
            await ctx.db.patch(args.matchId, { lastRead2: now });
        }
    }
});

export const getProofs = query({
    args: { matchId: v.id("matches") },
    handler: async (ctx, args) => {
        const identity = await ctx.auth.getUserIdentity();
        if (!identity) return [];

        const user = await ctx.db
            .query("users")
            .withIndex("by_tokenIdentifier", (q) =>
                q.eq("tokenIdentifier", identity.tokenIdentifier)
            )
            .unique();

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
                isMe: user?._id === p.uploaderId
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
        const todayProof = await ctx.db
            .query("proofs")
            .withIndex("by_matchId", (q) => q.eq("matchId", args.matchId))
            .filter((q) => q.and(
                q.eq(q.field("uploaderId"), user._id),
                q.eq(q.field("day"), day)
            ))
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
        const partnerProof = await ctx.db
            .query("proofs")
            .withIndex("by_matchId", (q) => q.eq("matchId", args.matchId))
            .filter((q) => q.and(
                q.eq(q.field("uploaderId"), partnerId),
                q.eq(q.field("day"), day)
            ))
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

// Get full 14-day progress data for both users
export const getProgressData = query({
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

        const partnerId = match.user1Id === user._id ? match.user2Id : match.user1Id;
        const partner = await ctx.db.get(partnerId);

        // Get my app and partner's app
        const isUser1 = match.user1Id === user._id;
        const myAppId = isUser1 ? match.app1Id : match.app2Id;
        const partnerAppId = isUser1 ? match.app2Id : match.app1Id;
        const myApp = await ctx.db.get(myAppId);
        const partnerApp = await ctx.db.get(partnerAppId);

        const currentDay = calculateDay(match.startDate);

        // Get all proofs for this match
        const allProofs = await ctx.db
            .query("proofs")
            .withIndex("by_matchId", (q) => q.eq("matchId", args.matchId))
            .collect();

        // Group proofs by day and user
        const myProofs = allProofs.filter(p => p.uploaderId === user._id);
        const partnerProofs = allProofs.filter(p => p.uploaderId === partnerId);

        // Build 14-day grid
        const days = [];
        for (let day = 1; day <= 14; day++) {
            const myProofForDay = myProofs.find(p => p.day === day);
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
        const myApprovedCount = myProofs.filter(p => p.status === "approved").length;
        const partnerApprovedCount = partnerProofs.filter(p => p.status === "approved").length;
        const myPendingCount = myProofs.filter(p => p.status === "pending").length;
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
            partnerName: partner?.name || "Partner",
            myAppName: myApp?.title || "My App",
            partnerAppName: partnerApp?.title || "Partner's App"
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

            // Check if tester uploaded proof for today
            const proof = await ctx.db
                .query("proofs")
                .withIndex("by_matchId", (q) => q.eq("matchId", match._id))
                .filter((q) => q.and(
                    q.eq(q.field("uploaderId"), testerId),
                    q.eq(q.field("day"), day)
                ))
                .first();

            const isUser1 = match.user1Id === user?._id;
            const lastRead = isUser1 ? (match.lastRead1 || 0) : (match.lastRead2 || 0);
            const hasUnread = (match.lastActivity || 0) > lastRead;

            return {
                matchId: match._id,
                testerName: tester?.name || "Unknown",
                testerAvatar: resolveAvatarUrl(tester?.avatarUrl),
                day,
                status: proof ? proof.status : "pending",
                uploadedToday: !!proof,
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
                    updatedAt: Date.now()
                });
            }
        };

        await updateAppCounter(match.app1Id);
        await updateAppCounter(match.app2Id);
    }
});

// Maintenance: Delete images for proofs that were ALREADY approved before the change
export const cleanupOldApprovedProofs = mutation({
    args: {},
    handler: async (ctx) => {
        const proofs = await ctx.db
            .query("proofs")
            .filter((q) => q.eq(q.field("status"), "approved"))
            .collect();

        let count = 0;
        for (const proof of proofs) {
            if (proof.storageIds && proof.storageIds.length > 0) {
                // Delete files
                for (const storageId of proof.storageIds) {
                    await ctx.storage.delete(storageId);
                }
                // Update record
                await ctx.db.patch(proof._id, {
                    storageIds: []
                });
                count++;
            }
        }
        return `Cleaned up ${count} approved proofs`;
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

/**
 * Mutation to mark old proofs for deletion and clear their storageIds.
 * Returns a list of URLs that need to be deleted from R2.
 */
export const markOldProofsForDeletion = internalMutation({
    args: {},
    handler: async (ctx) => {
        const threeDaysAgo = Date.now() - (3 * 24 * 60 * 60 * 1000);

        // Find proofs older than 3 days that have storageIds
        const oldProofs = await ctx.db
            .query("proofs")
            .filter((q) =>
                q.and(
                    q.lt(q.field("_creationTime"), threeDaysAgo),
                    q.neq(q.field("storageIds"), []) // Only get ones with files
                )
            )
            .collect();

        const urlsToDelete: string[] = [];

        for (const proof of oldProofs) {
            // Check if storageIds exists and is not empty
            if (proof.storageIds && proof.storageIds.length > 0) {
                // Add all URLs to deletion list (filter for R2 URLs just in case)
                const r2Urls = proof.storageIds.filter(id => id.startsWith('http'));
                urlsToDelete.push(...r2Urls);

                // Clear the storageIds in DB immediately to "expire" them
                await ctx.db.patch(proof._id, {
                    storageIds: []
                });
            }
        }

        return urlsToDelete;
    }
});

/**
 * Action to physically delete the old proof files from R2.
 * Scheduled to run daily.
 */
export const cleanupOldProofsAction = internalAction({
    args: {},
    handler: async (ctx) => {
        // 1. Get list of URLs and clear them from DB
        const urlsToDelete = await ctx.runMutation(internal.matches.markOldProofsForDeletion, {});

        if (urlsToDelete.length === 0) {
            console.log("No old proofs to clean up.");
            return;
        }

        // 2. Delete each file from R2
        console.log(`Starting cleanup: Deleting ${urlsToDelete.length} old proof images...`);

        const results = await Promise.allSettled(urlsToDelete.map(async (url: string) => {
            try {
                const response = await fetch(url, { method: 'DELETE' });
                if (!response.ok) {
                    throw new Error(`Failed to delete ${url}: ${response.statusText}`);
                }
                return url;
            } catch (error) {
                console.error(`Error deleting ${url}:`, error);
                throw error;
            }
        }));

        const successCount = results.filter((r: PromiseSettledResult<string>) => r.status === 'fulfilled').length;
        console.log(`Cleanup complete: Deleted ${successCount}/${urlsToDelete.length} images.`);
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

// Check for App Owners who missed reviews (Pending proofs > 48h)
export const checkAppOwnerInactivity = internalMutation({
    args: {},
    handler: async (ctx) => {
        const TWO_DAYS_MS = 48 * 60 * 60 * 1000;
        const cutoffTime = Date.now() - TWO_DAYS_MS;

        // Get all active matches
        const activeMatches = await ctx.db
            .query("matches")
            .withIndex("by_status", (q) => q.eq("status", "active"))
            .collect();

        const slackers = new Set<Id<"users">>();

        for (const match of activeMatches) {
            // Get pending proofs for this match
            const proofs = await ctx.db
                .query("proofs")
                .withIndex("by_matchId", (q) => q.eq("matchId", match._id))
                .collect();

            for (const proof of proofs) {
                if (proof.status === "pending" && proof.submittedAt < cutoffTime) {
                    // Reviewer is the one who ISN'T the uploader
                    const reviewerId = proof.uploaderId === match.user1Id ? match.user2Id : match.user1Id;
                    slackers.add(reviewerId);
                }
            }
        }

        console.log(`Found ${slackers.size} inactive app owners.`);

        for (const userId of slackers) {
            console.log(`Penalizing user ${userId} for inactivity...`);

            // 1. Mark user to see popup
            await ctx.db.patch(userId, { showDeletionPopup: true });

            // 2. Archive their apps
            const apps = await ctx.db
                .query("apps")
                .withIndex("by_userId", (q) => q.eq("userId", userId))
                .collect();

            for (const app of apps) {
                if (app.status !== "archived" && app.status !== "completed") {
                    await ctx.db.patch(app._id, { status: "archived", updatedAt: Date.now() });
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

        // Get completed matches where user is either user1 or user2
        const completedMatches = await ctx.db
            .query("matches")
            .withIndex("by_status", (q) => q.eq("status", "completed"))
            .collect();

        // Filter for matches involving this user
        const myCompletedMatches = completedMatches.filter(
            m => m.user1Id === user._id || m.user2Id === user._id
        );

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


