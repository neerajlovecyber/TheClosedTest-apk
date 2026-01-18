import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

// Get or create a chat for the current user (User side)
export const getMyChat = mutation({
    args: {},
    handler: async (ctx) => {
        const identity = await ctx.auth.getUserIdentity();
        if (!identity) throw new Error("Not authenticated");

        const user = await ctx.db
            .query("users")
            .withIndex("by_tokenIdentifier", (q) => q.eq("tokenIdentifier", identity.tokenIdentifier))
            .first();
        if (!user) throw new Error("User not found");

        // Check if chat exists
        const existingChat = await ctx.db
            .query("admin_chats")
            .withIndex("by_userId", (q) => q.eq("userId", user._id))
            .first();

        if (existingChat) {
            return existingChat._id;
        }

        // Create new chat (no message until user actually sends one)
        const chatId = await ctx.db.insert("admin_chats", {
            userId: user._id,
            lastMessage: "",
            updatedAt: Date.now(),
            hasUnreadUser: false,
            hasUnreadAdmin: false, // No notification to admin until user sends first message
        });

        return chatId;
    },
});

// Get chat details and messages
export const getChatDetails = query({
    args: { chatId: v.id("admin_chats") },
    handler: async (ctx, args) => {
        const identity = await ctx.auth.getUserIdentity();
        if (!identity) throw new Error("Not authenticated");

        const chat = await ctx.db.get(args.chatId);
        if (!chat) throw new Error("Chat not found");

        const messages = await ctx.db
            .query("admin_messages")
            .withIndex("by_chatId", (q) => q.eq("chatId", args.chatId))
            .collect();

        // Fetch user info for UI
        const chatUser = await ctx.db.get(chat.userId);

        return {
            ...chat,
            messages,
            userName: chatUser?.name || "User",
            userAvatar: chatUser?.avatarUrl,
            userEmail: chatUser?.email,
        };
    },
});

// Send a message
export const sendMessage = mutation({
    args: {
        chatId: v.id("admin_chats"),
        content: v.string(),
        type: v.union(v.literal("text"), v.literal("image")),
    },
    handler: async (ctx, args) => {
        const identity = await ctx.auth.getUserIdentity();
        if (!identity) throw new Error("Not authenticated");

        const user = await ctx.db
            .query("users")
            .withIndex("by_tokenIdentifier", (q) => q.eq("tokenIdentifier", identity.tokenIdentifier))
            .first();
        if (!user) throw new Error("User not found");

        const chat = await ctx.db.get(args.chatId);
        if (!chat) throw new Error("Chat not found");

        const isAdmin = !!user.isAdmin;

        // Add message
        await ctx.db.insert("admin_messages", {
            chatId: args.chatId,
            senderId: user._id,
            content: args.content,
            type: args.type,
            sentAt: Date.now(),
        });

        // Update chat metadata
        await ctx.db.patch(args.chatId, {
            lastMessage: args.content,
            updatedAt: Date.now(),
            hasUnreadUser: isAdmin, // If admin sent, user has unread
            hasUnreadAdmin: !isAdmin, // If user sent, admin has unread
            adminId: isAdmin ? user._id : chat.adminId, // Track last responding admin
        });
    },
});

// Mark messages as read
export const markAsRead = mutation({
    args: { chatId: v.id("admin_chats") },
    handler: async (ctx, args) => {
        const identity = await ctx.auth.getUserIdentity();
        if (!identity) throw new Error("Not authenticated");

        const user = await ctx.db
            .query("users")
            .withIndex("by_tokenIdentifier", (q) => q.eq("tokenIdentifier", identity.tokenIdentifier))
            .first();
        if (!user) throw new Error("User not found");

        const isAdmin = !!user.isAdmin;

        if (isAdmin) {
            await ctx.db.patch(args.chatId, { hasUnreadAdmin: false });
        } else {
            await ctx.db.patch(args.chatId, { hasUnreadUser: false });
        }
    },
});

// List all chats (Admin only)
export const listChats = query({
    args: {},
    handler: async (ctx) => {
        const identity = await ctx.auth.getUserIdentity();
        if (!identity) return []; // Or throw

        const user = await ctx.db
            .query("users")
            .withIndex("by_tokenIdentifier", (q) => q.eq("tokenIdentifier", identity.tokenIdentifier))
            .first();

        if (!user?.isAdmin) return [];

        const chats = await ctx.db
            .query("admin_chats")
            .withIndex("by_updatedAt")
            .order("desc")
            .collect();

        // Enrich with user names
        const enrichedChats = await Promise.all(
            chats.map(async (chat) => {
                const u = await ctx.db.get(chat.userId);
                return {
                    ...chat,
                    userName: u?.name || "Unknown User",
                    userAvatar: u?.avatarUrl,
                    userEmail: u?.email,
                };
            })
        );

        return enrichedChats;
    },
});

// Search users to start chat (Admin only)
export const searchUsersToChat = query({
    args: { query: v.string() },
    handler: async (ctx, args) => {
        const identity = await ctx.auth.getUserIdentity();
        if (!identity) return [];

        const user = await ctx.db
            .query("users")
            .withIndex("by_tokenIdentifier", (q) => q.eq("tokenIdentifier", identity.tokenIdentifier))
            .first();

        if (!user?.isAdmin) return [];

        if (!args.query) return [];

        // Simple search (Convex doesn't have partial string match natively efficiently without search index, 
        // but for this scale a filtered scan or if they have a search index is fine. 
        // We'll fallback to scanning recent users or similar if no search service defined.
        // Assuming small user base for now or using existing search capabilities if any)

        // Use the existing users table. Ideally we'd use a search index. 
        // For now, let's just fetch all and filter JS side (LIMITATION: won't scale indefinitely)
        // OR better, if we assume they want to chat inactive users, we might need a dedicated search index.
        // Let's implement a 'get all users' for now, capped.

        const users = await ctx.db.query("users").take(50);
        return users.filter(u =>
            u.name?.toLowerCase().includes(args.query.toLowerCase()) ||
            u.email?.toLowerCase().includes(args.query.toLowerCase())
        );
    }
});

// Create chat with specific user (Admin side)
export const createChatWithUser = mutation({
    args: { userId: v.id("users") },
    handler: async (ctx, args) => {
        const identity = await ctx.auth.getUserIdentity();
        if (!identity) throw new Error("Not authenticated");

        const admin = await ctx.db
            .query("users")
            .withIndex("by_tokenIdentifier", (q) => q.eq("tokenIdentifier", identity.tokenIdentifier))
            .first();

        if (!admin?.isAdmin) throw new Error("Unauthorized");

        // Check if exists
        const existing = await ctx.db
            .query("admin_chats")
            .withIndex("by_userId", (q) => q.eq("userId", args.userId))
            .first();

        if (existing) return existing._id;

        const chatId = await ctx.db.insert("admin_chats", {
            userId: args.userId,
            adminId: admin._id,
            lastMessage: "Admin started chat",
            updatedAt: Date.now(),
            hasUnreadUser: true,
            hasUnreadAdmin: false,
        });

        return chatId;
    }
});
