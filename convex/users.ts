
import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

export const store = mutation({
    args: {},
    handler: async (ctx) => {
        const identity = await ctx.auth.getUserIdentity();
        if (!identity) {
            throw new Error("Called storeUser without authentication present");
        }

        // Check if we've already stored this identity before.
        const user = await ctx.db
            .query("users")
            .withIndex("by_tokenIdentifier", (q) =>
                q.eq("tokenIdentifier", identity.tokenIdentifier)
            )
            .unique();

        if (user !== null) {
            // If we've seen this identity before but the name/email has changed, patch the value.
            if (user.name !== identity.name || user.email !== identity.email) {
                await ctx.db.patch(user._id, {
                    name: identity.name,
                    email: identity.email,
                    updatedAt: Date.now()
                });
            }
            return user._id;
        }

        // If it's a new identity, create a new `User`.
        return await ctx.db.insert("users", {
            name: identity.name!,
            tokenIdentifier: identity.tokenIdentifier,
            email: identity.email!,
            // Defaults
            reputation: 100,
            appsCount: 0,
            isGroupMember: false,
            streak: 0,
            bestStreak: 0,
            createdAt: Date.now(),
            updatedAt: Date.now(),
        });
    },
});

export const checkIn = mutation({
    args: {},
    handler: async (ctx) => {
        const identity = await ctx.auth.getUserIdentity();
        if (!identity) throw new Error("Unauthenticated");

        const user = await ctx.db
            .query("users")
            .withIndex("by_tokenIdentifier", (q) =>
                q.eq("tokenIdentifier", identity.tokenIdentifier)
            )
            .unique();

        if (!user) throw new Error("User not found");

        const today = new Date().toISOString().split('T')[0];

        // Log daily activity for analytics
        const existingLog = await ctx.db.query("daily_activity")
            .withIndex("by_user_date", q => q.eq("userId", user._id).eq("date", today))
            .unique();
        if (!existingLog) {
            await ctx.db.insert("daily_activity", { userId: user._id, date: today });
        }

        const lastCheckIn = user.lastCheckInDate;

        if (lastCheckIn === today) {
            return { streak: user.streak ?? 0, checkedIn: false };
        }

        const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0];

        let newStreak = 1;
        if (lastCheckIn === yesterday) {
            newStreak = (user.streak ?? 0) + 1;
        }

        const newBest = Math.max(user.bestStreak ?? 0, newStreak);

        await ctx.db.patch(user._id, {
            streak: newStreak,
            bestStreak: newBest,
            lastCheckInDate: today,
            updatedAt: Date.now(),
        });

        return { streak: newStreak, checkedIn: true };
    },
});

// Get current authenticated user
export const getCurrentUser = query({
    args: {},
    handler: async (ctx) => {
        const identity = await ctx.auth.getUserIdentity();
        if (!identity) return null;

        const user = await ctx.db
            .query("users")
            .withIndex("by_tokenIdentifier", (q) =>
                q.eq("tokenIdentifier", identity.tokenIdentifier)
            )
            .unique();

        return user;
    }
});

export const confirmGroupMembership = mutation({
    args: {},
    handler: async (ctx) => {
        const identity = await ctx.auth.getUserIdentity();
        if (!identity) throw new Error("Unauthenticated");

        const user = await ctx.db
            .query("users")
            .withIndex("by_tokenIdentifier", (q) =>
                q.eq("tokenIdentifier", identity.tokenIdentifier)
            )
            .unique();

        if (!user) throw new Error("User not found");

        await ctx.db.patch(user._id, {
            isGroupMember: true,
            updatedAt: Date.now(),
        });
    },
});
