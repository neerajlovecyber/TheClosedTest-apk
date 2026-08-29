CREATE EXTENSION IF NOT EXISTS pg_trgm;
--> statement-breakpoint
CREATE EXTENSION IF NOT EXISTS pg_stat_statements;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "apps_title_trgm_idx" ON "apps" USING gin ("title" gin_trgm_ops);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "apps_package_name_trgm_idx" ON "apps" USING gin ("package_name" gin_trgm_ops);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "users_name_trgm_idx" ON "users" USING gin ("name" gin_trgm_ops);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "users_email_trgm_idx" ON "users" USING gin ("email" gin_trgm_ops);
