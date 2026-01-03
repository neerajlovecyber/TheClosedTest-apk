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

        // Check if either app is now filled and update status
        const app1 = await ctx.db.get(match.app1Id);
        const app2 = await ctx.db.get(match.app2Id);

        // Count active testers for app1
        if (app1 && app1.status === "recruiting") {
            const app1Matches = await ctx.db
                .query("matches")
                .filter((q) => q.and(
                    q.or(
                        q.eq(q.field("app1Id"), app1._id),
                        q.eq(q.field("app2Id"), app1._id)
                    ),
                    q.eq(q.field("status"), "active")
                ))
                .collect();

            if (app1Matches.length >= app1.requiredTesters) {
                await ctx.db.patch(app1._id, { status: "filled", updatedAt: Date.now() });
            }
        }

        // Count active testers for app2
        if (app2 && app2.status === "recruiting") {
            const app2Matches = await ctx.db
                .query("matches")
                .filter((q) => q.and(
                    q.or(
                        q.eq(q.field("app1Id"), app2._id),
                        q.eq(q.field("app2Id"), app2._id)
                    ),
                    q.eq(q.field("status"), "active")
                ))
                .collect();

            if (app2Matches.length >= app2.requiredTesters) {
                await ctx.db.patch(app2._id, { status: "filled", updatedAt: Date.now() });
            }
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

                // Calculate current day
                const currentDay = Math.floor((Date.now() - (match.startDate || Date.now())) / (1000 * 60 * 60 * 24)) + 1;
                const day = currentDay > 14 ? 14 : currentDay;

                // Check if user has uploaded proof for today and if it's approved
                const todayProof = await ctx.db
                    .query("proofs")
                    .withIndex("by_matchId", (q) => q.eq("matchId", match._id))
                    .filter((q) => q.and(
                        q.eq(q.field("uploaderId"), user._id),
                        q.eq(q.field("day"), day)
                    ))
                    .first();

                // If proof is approved, task is complete for today - don't show
                const needsAttention = !todayProof || todayProof.status !== "approved";

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
                    day,
                    totalDays: 14,
                    owner: owner?.name || "Unknown User",
                    relatedMyApp: myApp?.title || "My App",
                    iconUrl: resolvedUrl || "https://github.com/shadcn.png",
                    needsAttention,
                    proofStatus: todayProof?.status || "not_uploaded"
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
                    reputation: Math.max(0, (uploader.reputation || 100) - 1)
                });
            }
        }

        // Notify the uploader
        await ctx.db.insert("notifications", {
            userId: proof.uploaderId,
            type: "proof_update",
            title: args.status === "approved" ? "Proof Approved!" : "Proof Rejected",
            body: args.status === "approved"
                ? `Your Day ${proof.day} proof was approved!`
                : `Your Day ${proof.day} proof was rejected: ${args.rejectionReason}`,
            data: { matchId: proof.matchId, proofId: proof._id },
            read: false,
            createdAt: Date.now()
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

        const currentDay = Math.floor((Date.now() - match.startDate) / (1000 * 60 * 60 * 24)) + 1;
        const day = currentDay > 14 ? 14 : currentDay;

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

        const currentDay = Math.floor((Date.now() - match.startDate) / (1000 * 60 * 60 * 24)) + 1;
        const day = currentDay > 14 ? 14 : currentDay;

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

        const currentDay = Math.floor((Date.now() - match.startDate) / (1000 * 60 * 60 * 24)) + 1;

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
                myStatus: isFutureDay ? "future" : (myProofForDay?.status || "missed"),
                partnerStatus: isFutureDay ? "future" : (partnerProofForDay?.status || "missed"),
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
