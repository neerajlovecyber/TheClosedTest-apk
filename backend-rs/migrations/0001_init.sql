CREATE EXTENSION IF NOT EXISTS "pg_trgm";

CREATE TABLE IF NOT EXISTS "users" (
	"id" text PRIMARY KEY NOT NULL,
	"token_identifier" text,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"avatar_url" text,
	"reputation" integer DEFAULT 100 NOT NULL,
	"push_token" text,
	"is_group_member" boolean DEFAULT false NOT NULL,
	"is_admin" boolean DEFAULT false NOT NULL,
	"streak" integer DEFAULT 0 NOT NULL,
	"best_streak" integer DEFAULT 0 NOT NULL,
	"last_check_in_date" varchar(20),
	"unlocked_app_slots" integer DEFAULT 3 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_token_identifier_unique" UNIQUE("token_identifier"),
	CONSTRAINT "users_email_unique" UNIQUE("email")
);

CREATE TABLE IF NOT EXISTS "apps" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
	"title" text NOT NULL,
	"package_name" text NOT NULL,
	"play_store_url" text NOT NULL,
	"icon_url" text NOT NULL,
	"instructions" text NOT NULL,
	"required_testers" integer DEFAULT 12 NOT NULL,
	"status" text DEFAULT 'recruiting' NOT NULL,
	"completed_at" timestamp with time zone,
	"flag_count" integer DEFAULT 0 NOT NULL,
	"visibility_status" text DEFAULT 'unverified',
	"positive_votes" integer DEFAULT 0 NOT NULL,
	"negative_votes" integer DEFAULT 0 NOT NULL,
	"voters" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "matches" (
	"id" text PRIMARY KEY NOT NULL,
	"user1_id" text NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
	"app1_id" text NOT NULL REFERENCES "apps"("id") ON DELETE CASCADE,
	"user2_id" text NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
	"app2_id" text NOT NULL REFERENCES "apps"("id") ON DELETE CASCADE,
	"status" text DEFAULT 'pending' NOT NULL,
	"start_date" timestamp with time zone,
	"last_activity" timestamp with time zone DEFAULT now() NOT NULL,
	"last_read1" timestamp with time zone,
	"last_read2" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"user1_approved_count" integer DEFAULT 0 NOT NULL,
	"user2_approved_count" integer DEFAULT 0 NOT NULL,
	"user1_last_proof" jsonb,
	"user2_last_proof" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "proofs" (
	"id" text PRIMARY KEY NOT NULL,
	"match_id" text NOT NULL REFERENCES "matches"("id") ON DELETE CASCADE,
	"uploader_id" text NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
	"day" integer NOT NULL,
	"type" text DEFAULT 'image' NOT NULL,
	"storage_urls" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"comment" text,
	"rejection_reason" text,
	"submitted_at" timestamp with time zone DEFAULT now() NOT NULL,
	"reviewed_at" timestamp with time zone
);

CREATE TABLE IF NOT EXISTS "messages" (
	"id" text PRIMARY KEY NOT NULL,
	"match_id" text NOT NULL REFERENCES "matches"("id") ON DELETE CASCADE,
	"sender_id" text NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
	"content" text NOT NULL,
	"type" text DEFAULT 'text' NOT NULL,
	"storage_url" text,
	"sent_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "notifications" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
	"type" text NOT NULL,
	"title" text NOT NULL,
	"body" text NOT NULL,
	"data" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"read" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "reports" (
	"id" text PRIMARY KEY NOT NULL,
	"reporter_id" text NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
	"type" text NOT NULL,
	"target_id" text NOT NULL,
	"match_id" text REFERENCES "matches"("id") ON DELETE SET NULL,
	"reported_user_id" text REFERENCES "users"("id") ON DELETE SET NULL,
	"reported_app_id" text REFERENCES "apps"("id") ON DELETE SET NULL,
	"description" text NOT NULL,
	"screenshots" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"admin_notes" text,
	"action_taken" text,
	"resolved_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "user_bans" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
	"banned_by" text NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
	"banned_by_type" text DEFAULT 'manual' NOT NULL,
	"reason" text NOT NULL,
	"permanent" boolean DEFAULT true NOT NULL,
	"expires_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "app_bans" (
	"id" text PRIMARY KEY NOT NULL,
	"package_name" text NOT NULL UNIQUE,
	"play_store_url" text NOT NULL,
	"app_id" text REFERENCES "apps"("id") ON DELETE SET NULL,
	"title" text NOT NULL,
	"banned_by" text NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
	"reason" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "reputation_logs" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
	"delta" integer NOT NULL,
	"reason" text NOT NULL,
	"reference_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "daily_activity" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
	"date" varchar(20) NOT NULL
);

CREATE TABLE IF NOT EXISTS "boost_cycles" (
	"id" text PRIMARY KEY NOT NULL,
	"cycle_start" timestamp with time zone NOT NULL,
	"cycle_end" timestamp with time zone NOT NULL
);

CREATE TABLE IF NOT EXISTS "boost_leaderboard" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
	"app_id" text REFERENCES "apps"("id") ON DELETE SET NULL,
	"boost_score" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "user_warnings" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
	"issued_by" text NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
	"reason" text NOT NULL,
	"read" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "admin_chats" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
	"admin_id" text REFERENCES "users"("id") ON DELETE SET NULL,
	"last_message" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"has_unread_user" boolean DEFAULT false NOT NULL,
	"has_unread_admin" boolean DEFAULT false NOT NULL
);

CREATE TABLE IF NOT EXISTS "admin_messages" (
	"id" text PRIMARY KEY NOT NULL,
	"chat_id" text NOT NULL REFERENCES "admin_chats"("id") ON DELETE CASCADE,
	"sender_id" text NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
	"content" text NOT NULL,
	"type" text DEFAULT 'text' NOT NULL,
	"is_admin" boolean DEFAULT false NOT NULL,
	"sent_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "analytics" (
	"id" text PRIMARY KEY NOT NULL,
	"date" varchar(20) NOT NULL UNIQUE,
	"active_users" integer DEFAULT 0 NOT NULL,
	"active_matches" integer DEFAULT 0 NOT NULL,
	"proofs_uploaded" integer DEFAULT 0 NOT NULL,
	"apps_submitted" integer DEFAULT 0 NOT NULL,
	"reports_created" integer DEFAULT 0 NOT NULL,
	"new_users" integer DEFAULT 0 NOT NULL
);

-- Indexes
CREATE INDEX IF NOT EXISTS "apps_user_id_idx" ON "apps" ("user_id");
CREATE INDEX IF NOT EXISTS "apps_status_idx" ON "apps" ("status");
CREATE INDEX IF NOT EXISTS "matches_user1_idx" ON "matches" ("user1_id");
CREATE INDEX IF NOT EXISTS "matches_user2_idx" ON "matches" ("user2_id");
CREATE INDEX IF NOT EXISTS "matches_status_idx" ON "matches" ("status");
CREATE INDEX IF NOT EXISTS "messages_match_id_idx" ON "messages" ("match_id");
CREATE INDEX IF NOT EXISTS "notifications_user_read_idx" ON "notifications" ("user_id", "read");
CREATE INDEX IF NOT EXISTS "proofs_match_id_idx" ON "proofs" ("match_id");
