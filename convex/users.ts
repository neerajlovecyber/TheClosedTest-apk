
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
                    avatarUrl: identity.pictureUrl,
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
            avatarUrl: identity.pictureUrl,
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

export const savePushToken = mutation({
    args: { pushToken: v.string() },
    handler: async (ctx, args) => {
        const identity = await ctx.auth.getUserIdentity();
        if (!identity) return;

        const user = await ctx.db
            .query("users")
            .withIndex("by_tokenIdentifier", (q) =>
                q.eq("tokenIdentifier", identity.tokenIdentifier)
            )
            .unique();

        if (!user) return;

        // Remove this token from any other users (in case of device reuse or re-login)
        const usersWithSameToken = await ctx.db
            .query("users")
            .filter((q) => q.eq(q.field("pushToken"), args.pushToken))
            .collect();

        for (const otherUser of usersWithSameToken) {
            if (otherUser._id !== user._id) {
                await ctx.db.patch(otherUser._id, {
                    pushToken: undefined,
                    updatedAt: Date.now(),
                });
            }
        }

        // Update current user's token
        await ctx.db.patch(user._id, {
            pushToken: args.pushToken,
            updatedAt: Date.now(),
        });
    },
});

export const syncAppCount = mutation({
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

        const apps = await ctx.db
            .query("apps")
            .withIndex("by_userId", (q) => q.eq("userId", user._id))
            .collect();

        // Filter out archived apps if they don't count
        const activeApps = apps.filter(app => app.status !== "archived");

        await ctx.db.patch(user._id, {
            appsCount: activeApps.length,
            updatedAt: Date.now(),
        });

        return activeApps.length;
    }
});

// Unlock an app slot after watching rewarded ad
export const unlockAppSlot = mutation({
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

        const currentSlots = user.unlockedAppSlots ?? 1;

        if (currentSlots >= 3) {
            throw new Error("All app slots are already unlocked");
        }

        await ctx.db.patch(user._id, {
            unlockedAppSlots: currentSlots + 1,
            updatedAt: Date.now(),
        });

        return currentSlots + 1;
    }
});

export const clearDeletionPopup = mutation({
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
            showDeletionPopup: false,
            updatedAt: Date.now(),
        });
    }
});
