import { R2 } from "@convex-dev/r2";
import { components } from "./_generated/api";
import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

export const r2 = new R2(components.r2);

// Default client API for general uploads (generates UUID keys)
export const { generateUploadUrl, syncMetadata } = r2.clientApi({
    checkUpload: async (ctx, bucket) => {
        const identity = await ctx.auth.getUserIdentity();
        if (!identity) {
            throw new Error("Authentication required to upload files");
        }
    },
    onUpload: async (ctx, bucket, key) => {
        console.log(`File uploaded to R2: ${key}`);
    },
});

// Custom mutation for app icon uploads with deterministic keys
// This allows overwriting app icons when editing apps
export const generateAppIconUploadUrl = mutation({
    args: {
        appId: v.string(), // App ID to create deterministic key
    },
    handler: async (ctx, args) => {
        const identity = await ctx.auth.getUserIdentity();
        if (!identity) {
            throw new Error("Authentication required to upload files");
        }

        const key = `app-icons/${args.appId}.webp`;
        // r2.generateUploadUrl(key) returns { key, url }
        return await r2.generateUploadUrl(key);
    },
});

// Custom mutation for proof uploads with deterministic keys
export const generateProofUploadUrl = mutation({
    args: {
        matchId: v.string(),
        uploaderId: v.string(),
        day: v.number(),
        index: v.number(), // For multiple images (0-4)
    },
    handler: async (ctx, args) => {
        const identity = await ctx.auth.getUserIdentity();
        if (!identity) {
            throw new Error("Authentication required to upload files");
        }

        const timestamp = Date.now();
        const key = `proofs/${args.matchId}/${args.uploaderId}/${args.day}/${timestamp}_${args.index}.webp`;
        // r2.generateUploadUrl(key) returns { key, url }
        return await r2.generateUploadUrl(key);
    },
});

// Sync metadata after upload
export const syncR2Metadata = mutation({
    args: {
        key: v.string(),
    },
    handler: async (ctx, args) => {
        // The syncMetadata is already exported from clientApi
        // This is a simpler wrapper for direct calls
        console.log(`Syncing metadata for: ${args.key}`);
    },
});

// Get file URL for serving
export const getR2Url = query({
    args: {
        key: v.string(),
    },
    handler: async (ctx, args) => {
        return await r2.getUrl(args.key);
    },
});

// Delete file from R2 - requires ctx per docs
export const deleteR2Object = mutation({
    args: {
        key: v.string(),
    },
    handler: async (ctx, args) => {
        return await r2.deleteObject(ctx, args.key);
    },
});
