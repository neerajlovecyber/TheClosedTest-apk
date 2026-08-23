import { z } from "@hono/zod-openapi"

export const ReportSchema = z.object({
  id: z.string(),
  reporterId: z.string(),
  type: z.enum(["dispute", "app_spam", "toxic_user", "other", "app_broken", "app_not_visible", "user_unresponsive"]),
  targetId: z.string(),
  matchId: z.string().nullable().optional(),
  description: z.string(),
  screenshots: z.array(z.string()),
  status: z.enum(["pending", "resolved", "dismissed"]),
  adminNotes: z.string().nullable().optional(),
  actionTaken: z.string().nullable().optional(),
  resolvedAt: z.string().or(z.date()).nullable().optional(),
  createdAt: z.string().or(z.date()),
})

export const CreateReportSchema = z.object({
  type: z.enum(["dispute", "app_spam", "toxic_user", "other", "app_broken", "app_not_visible", "user_unresponsive"]),
  targetId: z.string(),
  matchId: z.string().optional(),
  reportedUserId: z.string().optional(),
  reportedAppId: z.string().optional(),
  description: z.string().min(5),
  screenshots: z.array(z.string()).default([]),
})

export const BanUserSchema = z.object({
  userId: z.string(),
  reason: z.string().min(3),
  permanent: z.boolean().default(true),
})

export const BanAppSchema = z.object({
  packageName: z.string().min(3),
  playStoreUrl: z.string().url(),
  title: z.string(),
  reason: z.string().min(3),
})

export const AdminChatSchema = z.object({
  id: z.string(),
  userId: z.string(),
  adminId: z.string().nullable().optional(),
  lastMessage: z.string(),
  updatedAt: z.string().or(z.date()),
  hasUnreadUser: z.boolean(),
  hasUnreadAdmin: z.boolean(),
})

export const AdminChatWithUserSchema = z.object({
  id: z.string(),
  userId: z.string(),
  adminId: z.string().nullable().optional(),
  lastMessage: z.string(),
  updatedAt: z.string().or(z.date()),
  hasUnreadUser: z.boolean(),
  hasUnreadAdmin: z.boolean(),
  user: z
    .object({
      id: z.string(),
      name: z.string(),
      email: z.string(),
      avatarUrl: z.string().nullable().optional(),
    })
    .nullable()
    .optional(),
})

export const AdminUserListItemSchema = z.object({
  id: z.string(),
  tokenIdentifier: z.string().nullable().optional(),
  name: z.string(),
  email: z.string(),
  avatarUrl: z.string().nullable().optional(),
  reputation: z.number(),
  appsCount: z.number(),
  isAdmin: z.boolean(),
  isGroupMember: z.boolean(),
  streak: z.number(),
  bestStreak: z.number(),
  createdAt: z.string().or(z.date()),
})

export const AdminMessageSchema = z.object({
  id: z.string(),
  chatId: z.string(),
  senderId: z.string(),
  content: z.string(),
  type: z.enum(["text", "image"]),
  isAdmin: z.boolean(),
  sentAt: z.string().or(z.date()),
})

export const SendAdminMessageSchema = z.object({
  content: z.string().min(1),
  type: z.enum(["text", "image"]).default("text"),
})

export const AdminAppItemSchema = z.object({
  id: z.string(),
  userId: z.string(),
  title: z.string(),
  packageName: z.string(),
  playStoreUrl: z.string(),
  iconUrl: z.string(),
  instructions: z.string(),
  requiredTesters: z.number(),
  currentTesters: z.number(),
  status: z.string(),
  visibilityStatus: z.string().nullable().optional(),
  flagCount: z.number(),
  positiveVotes: z.number(),
  negativeVotes: z.number(),
  createdAt: z.string().or(z.date()),
  updatedAt: z.string().or(z.date()),
  user: z
    .object({
      id: z.string(),
      name: z.string().nullable().optional(),
      email: z.string().nullable().optional(),
      avatarUrl: z.string().nullable().optional(),
      reputation: z.number().optional(),
    })
    .nullable()
    .optional(),
  isDuplicate: z.boolean().optional(),
})
