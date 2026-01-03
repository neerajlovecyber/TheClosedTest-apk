
import { v } from "convex/values";
import { mutation } from "./_generated/server";

export const generateUploadUrl = mutation({
    args: {
        // We can add validation here if needed, e.g. file type
    },
    handler: async (ctx) => {
        // 1. Generate a short-lived upload URL
        return await ctx.storage.generateUploadUrl();
    },
});
