CREATE TABLE "reputation_logs" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"delta" integer NOT NULL,
	"reason" text NOT NULL,
	"reference_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "users" ALTER COLUMN "unlocked_app_slots" SET DEFAULT 3;--> statement-breakpoint
ALTER TABLE "reputation_logs" ADD CONSTRAINT "reputation_logs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "reputation_logs_user_idx" ON "reputation_logs" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "reputation_logs_created_idx" ON "reputation_logs" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "apps_user_status_idx" ON "apps" USING btree ("user_id","status");--> statement-breakpoint
CREATE INDEX "apps_status_created_idx" ON "apps" USING btree ("status","created_at");--> statement-breakpoint
CREATE INDEX "apps_title_trgm_idx" ON "apps" USING gin ("title" gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "apps_package_name_trgm_idx" ON "apps" USING gin ("package_name" gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "matches_app1_status_idx" ON "matches" USING btree ("app1_id","status");--> statement-breakpoint
CREATE INDEX "matches_app2_status_idx" ON "matches" USING btree ("app2_id","status");--> statement-breakpoint
CREATE INDEX "matches_user1_status_idx" ON "matches" USING btree ("user1_id","status");--> statement-breakpoint
CREATE INDEX "matches_user2_status_idx" ON "matches" USING btree ("user2_id","status");--> statement-breakpoint
CREATE INDEX "matches_status_activity_idx" ON "matches" USING btree ("status","last_activity");--> statement-breakpoint
CREATE INDEX "messages_match_sent_idx" ON "messages" USING btree ("match_id","sent_at");--> statement-breakpoint
CREATE INDEX "proofs_match_uploader_day_idx" ON "proofs" USING btree ("match_id","uploader_id","day");--> statement-breakpoint
CREATE INDEX "proofs_uploader_status_idx" ON "proofs" USING btree ("uploader_id","status");--> statement-breakpoint
CREATE INDEX "users_name_trgm_idx" ON "users" USING gin ("name" gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "users_email_trgm_idx" ON "users" USING gin ("email" gin_trgm_ops);--> statement-breakpoint
ALTER TABLE "apps" DROP COLUMN "current_testers";--> statement-breakpoint
ALTER TABLE "users" DROP COLUMN "show_deletion_popup";