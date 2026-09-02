-- AlterTable admin
ALTER TABLE "admin" ADD COLUMN IF NOT EXISTS "token_version" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "admin" ADD COLUMN IF NOT EXISTS "deleted_at" TIMESTAMP(3);

-- CreateIndex on admin
CREATE INDEX IF NOT EXISTS "admin_email_idx" ON "admin"("email");
CREATE INDEX IF NOT EXISTS "admin_status_idx" ON "admin"("status");
CREATE INDEX IF NOT EXISTS "admin_deleted_at_idx" ON "admin"("deleted_at");

-- AlterTable admin_roles
ALTER TABLE "admin_roles" ADD COLUMN IF NOT EXISTS "role_code" VARCHAR(80);
ALTER TABLE "admin_roles" ADD COLUMN IF NOT EXISTS "is_system" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "admin_roles" ADD COLUMN IF NOT EXISTS "deleted_at" TIMESTAMP(3);

-- Backfill role_code from role_name
UPDATE "admin_roles" SET "role_code" = 'SUPER_ADMIN', "is_system" = true WHERE "role_name" ILIKE '%super%' AND "role_code" IS NULL;
UPDATE "admin_roles" SET "role_code" = 'MODERATOR', "is_system" = true WHERE "role_name" ILIKE '%moderator%' AND "role_code" IS NULL;
UPDATE "admin_roles" SET "role_code" = 'COMPLIANCE', "is_system" = true WHERE "role_name" ILIKE '%compliance%' AND "role_code" IS NULL;
UPDATE "admin_roles" SET "role_code" = 'FINANCE', "is_system" = true WHERE "role_name" ILIKE '%finance%' AND "role_code" IS NULL;
UPDATE "admin_roles" SET "role_code" = 'SUPPORT', "is_system" = true WHERE "role_name" ILIKE '%support%' AND "role_code" IS NULL;
UPDATE "admin_roles" SET "role_code" = UPPER(REPLACE(TRIM("role_name"), ' ', '_')) WHERE "role_code" IS NULL;

-- Make role_code NOT NULL
ALTER TABLE "admin_roles" ALTER COLUMN "role_code" SET NOT NULL;

-- CreateIndex on admin_roles
CREATE UNIQUE INDEX IF NOT EXISTS "admin_roles_role_code_key" ON "admin_roles"("role_code");
CREATE INDEX IF NOT EXISTS "admin_roles_status_idx" ON "admin_roles"("status");
CREATE INDEX IF NOT EXISTS "admin_roles_role_code_idx" ON "admin_roles"("role_code");
CREATE INDEX IF NOT EXISTS "admin_roles_deleted_at_idx" ON "admin_roles"("deleted_at");

-- AlterTable admin_permissions
ALTER TABLE "admin_permissions" ADD COLUMN IF NOT EXISTS "sort_order" INTEGER NOT NULL DEFAULT 0;

-- CreateIndex on admin_permissions
CREATE INDEX IF NOT EXISTS "admin_permissions_permission_code_idx" ON "admin_permissions"("permission_code");
CREATE INDEX IF NOT EXISTS "admin_permissions_module_idx" ON "admin_permissions"("module");

-- AlterTable admin_audit_logs
ALTER TABLE "admin_audit_logs" ADD COLUMN IF NOT EXISTS "user_agent" VARCHAR(500);
ALTER TABLE "admin_audit_logs" ADD COLUMN IF NOT EXISTS "request_id" VARCHAR(100);

-- CreateIndex on admin_audit_logs
CREATE INDEX IF NOT EXISTS "admin_audit_logs_action_idx" ON "admin_audit_logs"("action");
