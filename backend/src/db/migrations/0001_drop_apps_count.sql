-- Drop stale apps_count counter from users table.
-- Both backends now compute appsCount live via SELECT COUNT(*) FROM apps
-- WHERE user_id = ? AND status != 'archived', so this column is unused
-- and can drift. Removing it prevents any future drift entirely.
--> statement-breakpoint
ALTER TABLE "users" DROP COLUMN "apps_count";
