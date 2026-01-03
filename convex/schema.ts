
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
        createdAt: v.number(),
        updatedAt: v.number(),
    })
        .index("by_tokenIdentifier", ["tokenIdentifier"]),

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
            v.literal("archived")
        ),
        createdAt: v.number(),
        updatedAt: v.number(),
    })
        .index("by_userId", ["userId"])
        .index("by_status", ["status"]),

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
        createdAt: v.number(),
    })
        .index("by_user1", ["user1Id"])
        .index("by_user2", ["user2Id"])
        .index("by_status", ["status"]),

    proofs: defineTable({
        matchId: v.id("matches"),
        uploaderId: v.id("users"),
        day: v.number(), // 1-14
        type: v.union(v.literal("image"), v.literal("video")),
        storageId: v.string(), // Convex Storage ID
        status: v.union(
            v.literal("pending"),
            v.literal("approved"),
            v.literal("rejected")
        ),
        comment: v.optional(v.string()),
        submittedAt: v.number(),
    })
        .index("by_matchId", ["matchId"])
        .index("by_match_day", ["matchId", "day"]),

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
            v.literal("other")
        ),
        targetId: v.string(), // ID of the Match, App, or User
        description: v.string(),
        status: v.union(
            v.literal("pending"),
            v.literal("resolved"),
            v.literal("dismissed")
        ),
        adminNotes: v.optional(v.string()),
        createdAt: v.number(),
    })
        .index("by_status", ["status"]),

    analytics: defineTable({
        date: v.string(), // YYYY-MM-DD
        activeUsers: v.number(),
        activeMatches: v.number(),
        proofsUploaded: v.number(),
        appsSubmitted: v.number(),
        reportsCreated: v.number(),
    })
        .index("by_date", ["date"]),
});
