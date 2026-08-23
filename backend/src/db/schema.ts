import { relations, sql } from "drizzle-orm"
import { boolean, index, integer, jsonb, pgTable, text, timestamp, varchar } from "drizzle-orm/pg-core"

// ---------------------------------------------------------------------------
// 1. Users & Auth
// ---------------------------------------------------------------------------
export const users = pgTable(
  "users",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    tokenIdentifier: text("token_identifier").unique(), // Clerk ID or custom auth ID
    name: text("name").notNull(),
    email: text("email").notNull().unique(),
    avatarUrl: text("avatar_url"),
    reputation: integer("reputation").default(100).notNull(),
    appsCount: integer("apps_count").default(0).notNull(),
    pushToken: text("push_token"),
    isGroupMember: boolean("is_group_member").default(false).notNull(),
    isAdmin: boolean("is_admin").default(false).notNull(),
    streak: integer("streak").default(0).notNull(),
    bestStreak: integer("best_streak").default(0).notNull(),
    lastCheckInDate: varchar("last_check_in_date", { length: 20 }), // YYYY-MM-DD
    unlockedAppSlots: integer("unlocked_app_slots").default(3).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    index("users_token_identifier_idx").on(table.tokenIdentifier),
    index("users_email_idx").on(table.email),
    index("users_push_token_idx").on(table.pushToken),
  ],
)

// Better Auth compatibility tables
export const session = pgTable(
  "session",
  {
    id: text("id").primaryKey(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    token: text("token").notNull().unique(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .$onUpdate(() => new Date())
      .notNull(),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
  },
  (table) => [index("session_user_id_idx").on(table.userId)],
)

export const account = pgTable(
  "account",
  {
    id: text("id").primaryKey(),
    accountId: text("account_id").notNull(),
    providerId: text("provider_id").notNull(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    accessToken: text("access_token"),
    refreshToken: text("refresh_token"),
    idToken: text("id_token"),
    accessTokenExpiresAt: timestamp("access_token_expires_at", {
      withTimezone: true,
    }),
    refreshTokenExpiresAt: timestamp("refresh_token_expires_at", {
      withTimezone: true,
    }),
    scope: text("scope"),
    password: text("password"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [index("account_user_id_idx").on(table.userId)],
)

export const verification = pgTable(
  "verification",
  {
    id: text("id").primaryKey(),
    identifier: text("identifier").notNull(),
    value: text("value").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [index("verification_identifier_idx").on(table.identifier)],
)

// ---------------------------------------------------------------------------
// 2. Apps
// ---------------------------------------------------------------------------
export const apps = pgTable(
  "apps",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    packageName: text("package_name").notNull(),
    playStoreUrl: text("play_store_url").notNull(),
    iconUrl: text("icon_url").notNull(),
    instructions: text("instructions").notNull(),
    requiredTesters: integer("required_testers").default(12).notNull(),
    status: text("status", {
      enum: ["recruiting", "filled", "paused", "archived", "completed"],
    })
      .default("recruiting")
      .notNull(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    flagCount: integer("flag_count").default(0).notNull(),
    visibilityStatus: text("visibility_status", {
      enum: ["unverified", "visible", "hidden"],
    }).default("unverified"),
    positiveVotes: integer("positive_votes").default(0).notNull(),
    negativeVotes: integer("negative_votes").default(0).notNull(),
    voters: jsonb("voters").$type<string[]>().default([]).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    index("apps_user_id_idx").on(table.userId),
    index("apps_status_idx").on(table.status),
    index("apps_package_name_idx").on(table.packageName),
  ],
)

// ---------------------------------------------------------------------------
// 3. Matches (14-Day Testing Pairings)
// ---------------------------------------------------------------------------
export const matches = pgTable(
  "matches",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    user1Id: text("user1_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    app1Id: text("app1_id")
      .notNull()
      .references(() => apps.id, { onDelete: "cascade" }),
    user2Id: text("user2_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    app2Id: text("app2_id")
      .notNull()
      .references(() => apps.id, { onDelete: "cascade" }),
    status: text("status", {
      enum: ["pending", "active", "completed", "cancelled", "archived"],
    })
      .default("pending")
      .notNull(),
    startDate: timestamp("start_date", { withTimezone: true }),
    lastActivity: timestamp("last_activity", { withTimezone: true }).defaultNow().notNull(),
    lastRead1: timestamp("last_read1", { withTimezone: true }),
    lastRead2: timestamp("last_read2", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    user1ApprovedCount: integer("user1_approved_count").default(0).notNull(),
    user2ApprovedCount: integer("user2_approved_count").default(0).notNull(),
    user1LastProof: jsonb("user1_last_proof").$type<{
      day: number
      status: string
      updatedAt: string
    }>(),
    user2LastProof: jsonb("user2_last_proof").$type<{
      day: number
      status: string
      updatedAt: string
    }>(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    index("matches_user1_idx").on(table.user1Id),
    index("matches_user2_idx").on(table.user2Id),
    index("matches_app1_idx").on(table.app1Id),
    index("matches_app2_idx").on(table.app2Id),
    index("matches_status_idx").on(table.status),
  ],
)

// ---------------------------------------------------------------------------
// 4. Daily Proofs
// ---------------------------------------------------------------------------
export const proofs = pgTable(
  "proofs",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    matchId: text("match_id")
      .notNull()
      .references(() => matches.id, { onDelete: "cascade" }),
    uploaderId: text("uploader_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    day: integer("day").notNull(), // 1 to 14
    type: text("type", { enum: ["image", "video"] })
      .default("image")
      .notNull(),
    storageUrls: jsonb("storage_urls").$type<string[]>().default([]).notNull(),
    status: text("status", { enum: ["pending", "approved", "rejected"] })
      .default("pending")
      .notNull(),
    comment: text("comment"),
    rejectionReason: text("rejection_reason"),
    submittedAt: timestamp("submitted_at", { withTimezone: true }).defaultNow().notNull(),
    reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
  },
  (table) => [
    index("proofs_match_id_idx").on(table.matchId),
    index("proofs_uploader_id_idx").on(table.uploaderId),
    index("proofs_match_day_idx").on(table.matchId, table.day),
  ],
)

// ---------------------------------------------------------------------------
// 5. Messages (Match Chat)
// ---------------------------------------------------------------------------
export const messages = pgTable(
  "messages",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    matchId: text("match_id")
      .notNull()
      .references(() => matches.id, { onDelete: "cascade" }),
    senderId: text("sender_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    content: text("content").notNull(),
    type: text("type", { enum: ["text", "image", "video"] })
      .default("text")
      .notNull(),
    storageUrl: text("storage_url"),
    sentAt: timestamp("sent_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [index("messages_match_id_idx").on(table.matchId), index("messages_sender_id_idx").on(table.senderId)],
)

// ---------------------------------------------------------------------------
// 6. Notifications
// ---------------------------------------------------------------------------
export const notifications = pgTable(
  "notifications",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    type: text("type", {
      enum: ["request", "acceptance", "reminder", "proof_update", "message", "match_cancelled"],
    }).notNull(),
    title: text("title").notNull(),
    body: text("body").notNull(),
    data: jsonb("data").$type<Record<string, unknown>>().default({}).notNull(),
    read: boolean("read").default(false).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("notifications_user_read_idx").on(table.userId, table.read),
    index("notifications_user_created_idx").on(table.userId, table.createdAt),
  ],
)

// ---------------------------------------------------------------------------
// 7. Moderation: Reports, Bans & Warnings
// ---------------------------------------------------------------------------
export const reports = pgTable(
  "reports",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    reporterId: text("reporter_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    type: text("type", {
      enum: ["dispute", "app_spam", "toxic_user", "other", "app_broken", "app_not_visible", "user_unresponsive"],
    }).notNull(),
    targetId: text("target_id").notNull(),
    matchId: text("match_id").references(() => matches.id, {
      onDelete: "set null",
    }),
    reportedUserId: text("reported_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    reportedAppId: text("reported_app_id").references(() => apps.id, {
      onDelete: "set null",
    }),
    description: text("description").notNull(),
    screenshots: jsonb("screenshots").$type<string[]>().default([]).notNull(),
    status: text("status", { enum: ["pending", "resolved", "dismissed"] })
      .default("pending")
      .notNull(),
    adminNotes: text("admin_notes"),
    actionTaken: text("action_taken"),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [index("reports_status_idx").on(table.status), index("reports_reporter_idx").on(table.reporterId)],
)

export const userBans = pgTable(
  "user_bans",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    bannedBy: text("banned_by")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    bannedByType: text("banned_by_type", { enum: ["manual", "auto"] })
      .default("manual")
      .notNull(),
    reason: text("reason").notNull(),
    permanent: boolean("permanent").default(true).notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [index("user_bans_user_idx").on(table.userId)],
)

export const appBans = pgTable(
  "app_bans",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    packageName: text("package_name").unique().notNull(),
    playStoreUrl: text("play_store_url").notNull(),
    appId: text("app_id").references(() => apps.id, { onDelete: "set null" }),
    title: text("title").notNull(),
    bannedBy: text("banned_by")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    reason: text("reason").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [index("app_bans_package_name_idx").on(table.packageName)],
)

export const userWarnings = pgTable(
  "user_warnings",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    issuedBy: text("issued_by")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    reason: text("reason").notNull(),
    read: boolean("read").default(false).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("user_warnings_user_idx").on(table.userId),
    index("user_warnings_user_read_idx").on(table.userId, table.read),
  ],
)

// ---------------------------------------------------------------------------
// 8. Admin Support Chats
// ---------------------------------------------------------------------------
export const adminChats = pgTable(
  "admin_chats",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    adminId: text("admin_id").references(() => users.id, {
      onDelete: "set null",
    }),
    lastMessage: text("last_message").notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
    hasUnreadUser: boolean("has_unread_user").default(false).notNull(),
    hasUnreadAdmin: boolean("has_unread_admin").default(false).notNull(),
  },
  (table) => [index("admin_chats_user_idx").on(table.userId), index("admin_chats_updated_idx").on(table.updatedAt)],
)

export const adminMessages = pgTable(
  "admin_messages",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    chatId: text("chat_id")
      .notNull()
      .references(() => adminChats.id, { onDelete: "cascade" }),
    senderId: text("sender_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    content: text("content").notNull(),
    type: text("type", { enum: ["text", "image"] })
      .default("text")
      .notNull(),
    isAdmin: boolean("is_admin").default(false).notNull(),
    sentAt: timestamp("sent_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [index("admin_messages_chat_id_idx").on(table.chatId)],
)

// ---------------------------------------------------------------------------
// 9. Analytics & Leaderboards
// ---------------------------------------------------------------------------
export const analytics = pgTable(
  "analytics",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    date: varchar("date", { length: 20 }).unique().notNull(), // YYYY-MM-DD
    activeUsers: integer("active_users").default(0).notNull(),
    activeMatches: integer("active_matches").default(0).notNull(),
    proofsUploaded: integer("proofs_uploaded").default(0).notNull(),
    appsSubmitted: integer("apps_submitted").default(0).notNull(),
    reportsCreated: integer("reports_created").default(0).notNull(),
    newUsers: integer("new_users").default(0).notNull(),
  },
  (table) => [index("analytics_date_idx").on(table.date)],
)

export const dailyActivity = pgTable(
  "daily_activity",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    date: varchar("date", { length: 20 }).notNull(), // YYYY-MM-DD
  },
  (table) => [
    index("daily_activity_date_idx").on(table.date),
    index("daily_activity_user_date_idx").on(table.userId, table.date),
  ],
)

export const boostCycles = pgTable("boost_cycles", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  cycleStart: timestamp("cycle_start", { withTimezone: true }).notNull(),
  cycleEnd: timestamp("cycle_end", { withTimezone: true }).notNull(),
})

export const boostLeaderboard = pgTable(
  "boost_leaderboard",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    appId: text("app_id").references(() => apps.id, { onDelete: "set null" }),
    boostScore: integer("boost_score").default(0).notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    index("boost_leaderboard_score_idx").on(table.boostScore),
    index("boost_leaderboard_user_idx").on(table.userId),
  ],
)

// ---------------------------------------------------------------------------
// 10. Relations
// ---------------------------------------------------------------------------
export const usersRelations = relations(users, ({ many }) => ({
  apps: many(apps),
  matchesAsUser1: many(matches, { relationName: "user1Matches" }),
  matchesAsUser2: many(matches, { relationName: "user2Matches" }),
  proofs: many(proofs),
  messages: many(messages),
  notifications: many(notifications),
  reports: many(reports),
  warnings: many(userWarnings),
  sessions: many(session),
  accounts: many(account),
}))

export const appsRelations = relations(apps, ({ one, many }) => ({
  user: one(users, {
    fields: [apps.userId],
    references: [users.id],
  }),
  matchesAsApp1: many(matches, { relationName: "app1Matches" }),
  matchesAsApp2: many(matches, { relationName: "app2Matches" }),
}))

export const matchesRelations = relations(matches, ({ one, many }) => ({
  user1: one(users, {
    fields: [matches.user1Id],
    references: [users.id],
    relationName: "user1Matches",
  }),
  user2: one(users, {
    fields: [matches.user2Id],
    references: [users.id],
    relationName: "user2Matches",
  }),
  app1: one(apps, {
    fields: [matches.app1Id],
    references: [apps.id],
    relationName: "app1Matches",
  }),
  app2: one(apps, {
    fields: [matches.app2Id],
    references: [apps.id],
    relationName: "app2Matches",
  }),
  proofs: many(proofs),
  messages: many(messages),
}))

export const proofsRelations = relations(proofs, ({ one }) => ({
  match: one(matches, {
    fields: [proofs.matchId],
    references: [matches.id],
  }),
  uploader: one(users, {
    fields: [proofs.uploaderId],
    references: [users.id],
  }),
}))

export const messagesRelations = relations(messages, ({ one }) => ({
  match: one(matches, {
    fields: [messages.matchId],
    references: [matches.id],
  }),
  sender: one(users, {
    fields: [messages.senderId],
    references: [users.id],
  }),
}))

export const notificationsRelations = relations(notifications, ({ one }) => ({
  user: one(users, {
    fields: [notifications.userId],
    references: [users.id],
  }),
}))

export const adminChatsRelations = relations(adminChats, ({ one, many }) => ({
  user: one(users, {
    fields: [adminChats.userId],
    references: [users.id],
  }),
  admin: one(users, {
    fields: [adminChats.adminId],
    references: [users.id],
  }),
  messages: many(adminMessages),
}))

export const adminMessagesRelations = relations(adminMessages, ({ one }) => ({
  chat: one(adminChats, {
    fields: [adminMessages.chatId],
    references: [adminChats.id],
  }),
  sender: one(users, {
    fields: [adminMessages.senderId],
    references: [users.id],
  }),
}))
