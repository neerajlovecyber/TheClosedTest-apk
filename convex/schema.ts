
import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
    users: defineTable({
        tokenIdentifier: v.string(), // Clerk ID or similar unique identifier
        name: v.optional(v.string()),
        email: v.optional(v.string()),
        avatarUrl: v.optional(v.string()),
        reputation: v.number(), // Default 100
        appsCount: v.number(),
        pushToken: v.optional(v.string()), // Expo Push Token
        isGroupMember: v.boolean(), // Has confirmed joining Google Group
        isAdmin: v.optional(v.boolean()), // Admin access (default: false)
        streak: v.optional(v.number()), // Current daily streak
        bestStreak: v.optional(v.number()), // Highest streak
        lastCheckInDate: v.optional(v.string()), // YYYY-MM-DD of last activity
        unlockedAppSlots: v.optional(v.number()), // Number of unlocked app slots (default 1, max 3)
        boostPoints: v.optional(v.number()), // Boost points in current 48h cycle
        boostedAppId: v.optional(v.id("apps")), // Currently selected app to boost
        showDeletionPopup: v.optional(v.boolean()), // Flag to show "App Deleted" popup
        createdAt: v.number(),
        updatedAt: v.number(),
    })
        .index("by_tokenIdentifier", ["tokenIdentifier"])
        .index("by_pushToken", ["pushToken"])
        .index("by_boostPoints", ["boostPoints"])
        .searchIndex("search_name", {
            searchField: "name",
        })
        .searchIndex("search_email", {
            searchField: "email",
        }),

    apps: defineTable({
        userId: v.id("users"),
        title: v.string(),
        packageName: v.string(),
        playStoreUrl: v.string(),
        iconUrl: v.string(),
        storageIconId: v.optional(v.string()),
        instructions: v.string(),
        requiredTesters: v.number(), // e.g., 12
        currentTesters: v.number(),
        status: v.union(
            v.literal("recruiting"),
            v.literal("filled"),
            v.literal("paused"),
            v.literal("archived"),
            v.literal("completed") // NEW: Got production access
        ),
        completedAt: v.optional(v.number()), // NEW: When marked as completed
        // Boost system fields
        boostScore: v.optional(v.number()), // Points in current 48h cycle (default 0)
        lastBoostedAt: v.optional(v.number()), // Timestamp of last boost action
        flagCount: v.optional(v.number()), // Number of times reported as broken/not visible
        visibility: v.optional(v.object({
            status: v.union(v.literal("unverified"), v.literal("visible"), v.literal("hidden")), // hidden = problem
            positiveVotes: v.number(),
            negativeVotes: v.number(),
            // Keep track of who voted to prevent double voting
            voters: v.array(v.id("users"))
        })),
        createdAt: v.number(),
        updatedAt: v.number(),
    })
        .index("by_userId", ["userId"])
        .index("by_status", ["status"])
        .index("by_boostScore", ["boostScore"]),

    matches: defineTable({
        user1Id: v.id("users"),
        app1Id: v.id("apps"), // App owned by User 1, tested by User 2
        user2Id: v.id("users"),
        app2Id: v.id("apps"), // App owned by User 2, tested by User 1
        status: v.union(
            v.literal("pending"),
            v.literal("active"),
            v.literal("completed"),
            v.literal("cancelled"),
            v.literal("archived")
        ),
        startDate: v.number(),
        lastActivity: v.number(),
        lastRead1: v.optional(v.number()), // When User 1 last read the chat
        lastRead2: v.optional(v.number()), // When User 2 last read the chat
        completedAt: v.optional(v.number()), // When match was auto-completed
        user1ApprovedCount: v.optional(v.number()), // How many proofs user1 got approved
        user2ApprovedCount: v.optional(v.number()), // How many proofs user2 got approved
        createdAt: v.number(),
    })
        .index("by_user1", ["user1Id"])
        .index("by_user2", ["user2Id"])
        .index("by_status", ["status"])
        .index("by_app1", ["app1Id"])
        .index("by_app2", ["app2Id"]),

    proofs: defineTable({
        matchId: v.id("matches"),
        uploaderId: v.id("users"),
        day: v.number(), // 1-14
        type: v.union(v.literal("image"), v.literal("video")),
        storageIds: v.array(v.string()), // Multiple Convex Storage IDs (up to 5)
        status: v.union(
            v.literal("pending"),
            v.literal("approved"),
            v.literal("rejected")
        ),
        comment: v.optional(v.string()),
        rejectionReason: v.optional(v.string()), // Required when rejected
        submittedAt: v.number(),
        reviewedAt: v.optional(v.number()),
    })
        .index("by_matchId", ["matchId"])
        .index("by_match_day", ["matchId", "day"])
        .index("by_uploader_day", ["uploaderId", "matchId", "day"]),

    messages: defineTable({
        matchId: v.id("matches"),
        senderId: v.id("users"),
        content: v.string(),
        type: v.union(
            v.literal("text"),
            v.literal("image"),
            v.literal("video")
        ),
        storageId: v.optional(v.string()),
        sentAt: v.number(),
    })
        .index("by_matchId", ["matchId"]),

    notifications: defineTable({
        userId: v.id("users"),
        type: v.union(
            v.literal("request"),
            v.literal("acceptance"),
            v.literal("reminder"),
            v.literal("proof_update"),
            v.literal("message")
        ),
        title: v.string(),
        body: v.string(),
        data: v.optional(v.any()), // flexible object for related IDs
        read: v.boolean(),
        createdAt: v.number(),
    })
        .index("by_userId_read", ["userId", "read"]),

    reports: defineTable({
        reporterId: v.id("users"),
        type: v.union(
            v.literal("dispute"),
            v.literal("app_spam"),
            v.literal("toxic_user"),
            v.literal("other"),
            v.literal("app_broken"),
            v.literal("app_not_visible"),
            v.literal("user_unresponsive")
        ),
        targetId: v.string(), // ID of the Match, App, or User
        matchId: v.optional(v.id("matches")), // Link to conversation if chat-related
        reportedUserId: v.optional(v.id("users")), // Direct user reporting
        reportedAppId: v.optional(v.id("apps")), // App reporting
        description: v.string(),
        screenshots: v.optional(v.array(v.string())), // Storage IDs for proof
        status: v.union(
            v.literal("pending"),
            v.literal("resolved"),
            v.literal("dismissed")
        ),
        adminNotes: v.optional(v.string()),
        actionTaken: v.optional(v.string()), // What admin did
        resolvedAt: v.optional(v.number()),
        createdAt: v.number(),
    })
        .index("by_status", ["status"])
        .index("by_reporter", ["reporterId"]),

    user_bans: defineTable({
        userId: v.id("users"),
        bannedBy: v.id("users"), // Admin who issued ban
        bannedByType: v.union(v.literal("manual"), v.literal("auto")),
        reason: v.string(),
        permanent: v.boolean(),
        expiresAt: v.optional(v.number()), // For temporary bans
        createdAt: v.number(),
    })
        .index("by_userId", ["userId"]),

    app_bans: defineTable({
        packageName: v.string(), // PRIMARY BAN KEY
        playStoreUrl: v.string(),
        appId: v.optional(v.id("apps")),
        title: v.string(),
        bannedBy: v.id("users"),
        reason: v.string(),
        createdAt: v.number(),
    })
        .index("by_packageName", ["packageName"]),

    user_warnings: defineTable({
        userId: v.id("users"),
        issuedBy: v.id("users"), // Admin who warned
        reason: v.string(),
        read: v.boolean(),
        createdAt: v.number(),
    })
        .index("by_userId", ["userId"])
        .index("by_userId_read", ["userId", "read"]),

    admin_chats: defineTable({
        userId: v.id("users"),
        adminId: v.optional(v.id("users")), // Admin who claimed/replied last
        lastMessage: v.string(),
        updatedAt: v.number(),
        hasUnreadUser: v.boolean(), // User has unread messages
        hasUnreadAdmin: v.boolean(), // Admin has unread messages
    })
        .index("by_userId", ["userId"])
        .index("by_updatedAt", ["updatedAt"]),

    admin_messages: defineTable({
        chatId: v.id("admin_chats"),
        senderId: v.id("users"),
        content: v.string(),
        type: v.union(v.literal("text"), v.literal("image")),
        isAdmin: v.boolean(), // Was the sender acting as admin?
        sentAt: v.number(),
    })
        .index("by_chatId", ["chatId"]),


    analytics: defineTable({
        date: v.string(),
        activeUsers: v.number(),
        activeMatches: v.number(),
        proofsUploaded: v.number(),
        appsSubmitted: v.number(),
        reportsCreated: v.number(),
        newUsers: v.optional(v.number()),
    }).index("by_date", ["date"]),

    daily_activity: defineTable({
        userId: v.id("users"),
        date: v.string(),
    })
        .index("by_date", ["date"])
        .index("by_user_date", ["userId", "date"]),

    // Boost cycle tracking for 48-hour reset
    boost_cycles: defineTable({
        cycleStart: v.number(),   // Timestamp when current 48h cycle started
        cycleEnd: v.number(),     // Timestamp when cycle ends
    }),
});
