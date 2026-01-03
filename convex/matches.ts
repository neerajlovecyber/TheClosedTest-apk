import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { Id } from "./_generated/dataModel";

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
            throw new Error("Not authenticated");
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

        const targetApp = await ctx.db.get(args.targetAppId);
        if (!targetApp) {
            throw new Error("Target app not found");
        }

        if (targetApp.userId === user._id) {
            throw new Error("Cannot swap with your own app");
        }

        // Check if match already exists (pending or active)
        const existingMatch = await ctx.db
            .query("matches")
            .withIndex("by_user1", (q) => q.eq("user1Id", user._id))
            .filter((q) =>
                q.and(
                    q.eq(q.field("user2Id"), targetApp.userId),
                    q.or(
                        q.eq(q.field("status"), "pending"),
                        q.eq(q.field("status"), "active")
                    )
                )
            )
            .first();

        // Check reverse direction too
        const existingMatchReverse = await ctx.db
            .query("matches")
            .withIndex("by_user1", (q) => q.eq("user1Id", targetApp.userId))
            .filter((q) =>
                q.and(
                    q.eq(q.field("user2Id"), user._id),
                    q.or(
                        q.eq(q.field("status"), "pending"),
                        q.eq(q.field("status"), "active")
                    )
                )
            )
            .first();

        if (existingMatch || existingMatchReverse) {
            throw new Error("Active or pending match already exists with this user");
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

        // Optional: Create initial notification for user2
        await ctx.db.insert("notifications", {
            userId: targetApp.userId,
            type: "request",
            title: "New Swap Request",
            body: `${user.name || "A user"} wants to swap tests with you!`,
            data: { matchId, appId: args.targetAppId },
            read: false,
            createdAt: now,
        })

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

        await ctx.db.patch(args.matchId, {
            status: "active",
            startDate: Date.now(),
            lastActivity: Date.now(),
        });

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

        // 1. Check if I sent a request to them (I am user1, they are user2)
        const sentRequest = await ctx.db
            .query("matches")
            .withIndex("by_user1", (q) => q.eq("user1Id", user._id))
            .filter((q) =>
                q.and(
                    q.eq(q.field("user2Id"), targetApp.userId),
                    q.or(
                        q.eq(q.field("status"), "pending"),
                        q.eq(q.field("status"), "active")
                    )
                )
            )
            .first();

        if (sentRequest) {
            return {
                status: sentRequest.status, // "pending" or "active"
                isRequestor: true,
                matchId: sentRequest._id
            };
        }

        // 2. Check if they sent a request to me (I am user2, they are user1)
        // AND one of the apps involved is the one I'm looking at? 
        // Actually, if they sent a request, they are offering THEIR app (app1) for MY app (app2).
        // If I am viewing THEIR app (args.appId), then args.appId should be app1 in the match.

        const receivedRequest = await ctx.db
            .query("matches")
            .withIndex("by_user2", (q) => q.eq("user2Id", user._id))
            .filter((q) =>
                q.and(
                    q.eq(q.field("user1Id"), targetApp.userId),
                    q.or(
                        q.eq(q.field("status"), "pending"),
                        q.eq(q.field("status"), "active")
                    )
                )
            )
            .first();

        if (receivedRequest) {
            return {
                status: receivedRequest.status,
                isRequestor: false,
                matchId: receivedRequest._id
            };
        }

    },
});

// Helper to get image URL
const getImageUrl = async (ctx: any, storageId: string | undefined | null) => {
    if (!storageId) return "https://github.com/shadcn.png";
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

                let resolvedUrl = appToTest?.iconUrl;
                if (appToTest?.storageIconId) {
                    resolvedUrl = await getImageUrl(ctx, appToTest.storageIconId);
                } else if (appToTest?.iconUrl && !appToTest.iconUrl.startsWith("http")) {
                    resolvedUrl = await getImageUrl(ctx, appToTest.iconUrl);
                }

                return {
                    id: match._id,
                    name: appToTest?.title || "Unknown App",
                    status: match.status,
                    startDate: match.startDate,
                    day: Math.floor((Date.now() - (match.startDate || Date.now())) / (1000 * 60 * 60 * 24)) + 1, // Simple Day Calc
                    totalDays: 14,
                    owner: owner?.name || "Unknown User",
                    relatedMyApp: myApp?.title || "My App",
                    iconUrl: resolvedUrl || "https://github.com/shadcn.png"
                };
            })
        );

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
            partner, // This is the swap partner (could be same as owner if I am tester)
            startDate: match.startDate,
            day: Math.floor((Date.now() - match.startDate) / (1000 * 60 * 60 * 24)) + 1,
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
                    senderAvatar: sender?.avatarUrl,
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

        await ctx.db.insert("messages", {
            matchId: args.matchId,
            senderId: user._id,
            content: args.content,
            type: args.type,
            storageId: args.storageId,
            sentAt: Date.now()
        });
    }
});

export const getProofs = query({
    args: { matchId: v.id("matches") },
    handler: async (ctx, args) => {
        const identity = await ctx.auth.getUserIdentity();
        if (!identity) return [];

        const proofs = await ctx.db
            .query("proofs")
            .withIndex("by_matchId", (q) => q.eq("matchId", args.matchId))
            .collect();

        const proofsWithUrls = await Promise.all(proofs.map(async (p) => {
            const url = await getImageUrl(ctx, p.storageId);
            return { ...p, url };
        }));

        return proofsWithUrls;
    }
});

export const uploadProof = mutation({
    args: {
        matchId: v.id("matches"),
        storageId: v.string(),
        day: v.number(),
        type: v.union(v.literal("image"), v.literal("video")),
        comment: v.optional(v.string())
    },
    handler: async (ctx, args) => {
        const identity = await ctx.auth.getUserIdentity();
        if (!identity) throw new Error("Auth required");

        const user = await ctx.db
            .query("users")
            .withIndex("by_tokenIdentifier", (q) => q.eq("tokenIdentifier", identity.tokenIdentifier))
            .unique();

        if (!user) throw new Error("User not found");

        const match = await ctx.db.get(args.matchId);
        if (!match) throw new Error("Match not found");

        await ctx.db.insert("proofs", {
            matchId: args.matchId,
            uploaderId: user._id,
            day: args.day,
            type: args.type,
            storageId: args.storageId,
            status: "pending",
            comment: args.comment,
            submittedAt: Date.now()
        });
    }
});

export const reviewProof = mutation({
    args: {
        proofId: v.id("proofs"),
        status: v.union(v.literal("approved"), v.literal("rejected")),
    },
    handler: async (ctx, args) => {
        const identity = await ctx.auth.getUserIdentity();
        if (!identity) throw new Error("Auth required");
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

        await ctx.db.patch(args.proofId, {
            status: args.status
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
                    reputation: Math.max(0, (uploader.reputation || 100) - 1)
                });
            }
        }
    }
});
