import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

// Create a support ticket
export const createTicket = mutation({
    args: {
        subject: v.string(),
        initialMessage: v.string(),
        priority: v.union(
            v.literal("low"),
            v.literal("medium"),
            v.literal("high")
        ),
    },
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

        const now = Date.now();

        const ticketId = await ctx.db.insert("support_tickets", {
            userId: user._id,
            subject: args.subject,
            status: "open",
            priority: args.priority,
            messages: [
                {
                    senderId: user._id,
                    content: args.initialMessage,
                    timestamp: now,
                    isAdmin: false,
                },
            ],
            createdAt: now,
            updatedAt: now,
        });

        // TODO: Notify admins of new ticket

        return ticketId;
    },
});

// Add message to ticket
export const addTicketMessage = mutation({
    args: {
        ticketId: v.id("support_tickets"),
        content: v.string(),
    },
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

        const ticket = await ctx.db.get(args.ticketId);
        if (!ticket) throw new Error("Ticket not found");

        // Check if user is ticket owner or admin
        const isAdmin = user.isAdmin || false;
        const isOwner = ticket.userId === user._id;

        if (!isAdmin && !isOwner) {
            throw new Error("Not authorized to reply to this ticket");
        }

        // Add message to ticket
        const newMessage = {
            senderId: user._id,
            content: args.content,
            timestamp: Date.now(),
            isAdmin,
        };

        await ctx.db.patch(args.ticketId, {
            messages: [...ticket.messages, newMessage],
            updatedAt: Date.now(),
        });

        // If it was closed, reopen it
        if (ticket.status === "closed" || ticket.status === "resolved") {
            await ctx.db.patch(args.ticketId, { status: "open" });
        }

        // TODO: Send notification to other party (admin or user)

        return { success: true };
    },
});

// Update ticket status (admin only)
export const updateTicketStatus = mutation({
    args: {
        ticketId: v.id("support_tickets"),
        status: v.union(
            v.literal("open"),
            v.literal("in_progress"),
            v.literal("resolved"),
            v.literal("closed")
        ),
        assignedTo: v.optional(v.id("users")),
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

        const updates: any = {
            status: args.status,
            updatedAt: Date.now(),
        };

        if (args.assignedTo !== undefined) {
            updates.assignedTo = args.assignedTo;
        }

        await ctx.db.patch(args.ticketId, updates);

        return { success: true };
    },
});

// Get user's tickets
export const getUserTickets = query({
    args: {},
    handler: async (ctx) => {
        const identity = await ctx.auth.getUserIdentity();
        if (!identity) throw new Error("Unauthorized");

        const user = await ctx.db
            .query("users")
            .withIndex("by_tokenIdentifier", (q) =>
                q.eq("tokenIdentifier", identity.tokenIdentifier)
            )
            .unique();

        if (!user) throw new Error("User not found");

        const tickets = await ctx.db
            .query("support_tickets")
            .withIndex("by_userId", (q) => q.eq("userId", user._id))
            .order("desc")
            .collect();

        return tickets;
    },
});

// Get all tickets (admin only)
export const getAllTickets = query({
    args: {
        status: v.optional(v.union(
            v.literal("open"),
            v.literal("in_progress"),
            v.literal("resolved"),
            v.literal("closed")
        )),
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

        let tickets;

        if (args.status) {
            tickets = await ctx.db
                .query("support_tickets")
                .withIndex("by_status", (q) => q.eq("status", args.status!))
                .order("desc")
                .collect();
        } else {
            tickets = await ctx.db
                .query("support_tickets")
                .order("desc")
                .collect();
        }

        // Enrich with user data
        const enrichedTickets = await Promise.all(
            tickets.map(async (ticket) => {
                const user = await ctx.db.get(ticket.userId);
                let assignedToUser = null;
                if (ticket.assignedTo) {
                    assignedToUser = await ctx.db.get(ticket.assignedTo);
                }

                return {
                    ...ticket,
                    user,
                    assignedToUser,
                };
            })
        );

        return enrichedTickets;
    },
});

// Get ticket details with full message history
export const getTicketDetails = query({
    args: { ticketId: v.id("support_tickets") },
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

        const ticket = await ctx.db.get(args.ticketId);
        if (!ticket) throw new Error("Ticket not found");

        // Check permissions
        const isAdmin = user.isAdmin || false;
        const isOwner = ticket.userId === user._id;

        if (!isAdmin && !isOwner) {
            throw new Error("Not authorized to view this ticket");
        }

        // Get user details for each message
        const messagesWithUsers = await Promise.all(
            ticket.messages.map(async (msg) => {
                const sender = await ctx.db.get(msg.senderId);
                return {
                    ...msg,
                    senderName: sender?.name || "Unknown",
                    senderAvatar: sender?.avatarUrl,
                };
            })
        );

        const ticketUser = await ctx.db.get(ticket.userId);
        let assignedToUser = null;
        if (ticket.assignedTo) {
            assignedToUser = await ctx.db.get(ticket.assignedTo);
        }

        return {
            ...ticket,
            messages: messagesWithUsers,
            user: ticketUser,
            assignedToUser,
        };
    },
});

// Get ticket stats for admin
export const getTicketStats = query({
    args: {},
    handler: async (ctx) => {
        const identity = await ctx.auth.getUserIdentity();
        if (!identity) return null;

        const admin = await ctx.db
            .query("users")
            .withIndex("by_tokenIdentifier", (q) =>
                q.eq("tokenIdentifier", identity.tokenIdentifier)
            )
            .unique();

        if (!admin || !admin.isAdmin) return null;

        const tickets = await ctx.db.query("support_tickets").collect();

        return {
            open: tickets.filter((t) => t.status === "open").length,
            inProgress: tickets.filter((t) => t.status === "in_progress").length,
            resolved: tickets.filter((t) => t.status === "resolved").length,
            closed: tickets.filter((t) => t.status === "closed").length,
            total: tickets.length,
        };
    },
});
