CREATE INDEX IF NOT EXISTS "matches_app1_status_idx" ON "matches" ("app1_id", "status");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "matches_app2_status_idx" ON "matches" ("app2_id", "status");
