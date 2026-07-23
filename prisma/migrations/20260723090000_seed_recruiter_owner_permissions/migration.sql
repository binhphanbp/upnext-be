CREATE EXTENSION IF NOT EXISTS "pgcrypto";

INSERT INTO "recruiter_permissions" ("id", "code", "module", "action", "description", "created_at", "updated_at")
VALUES
  (gen_random_uuid(), 'jobs:manage', 'jobs', 'manage', 'Manage job posts', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'applications:manage', 'applications', 'manage', 'Manage candidate applications', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'applications:review_assigned', 'applications', 'review_assigned', 'Review assigned candidate applications', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'interviews:manage', 'interviews', 'manage', 'Manage interviews', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'interviews:review_assigned', 'interviews', 'review_assigned', 'Review assigned interviews', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'company:manage', 'company', 'manage', 'Manage company profile and settings', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'members:manage', 'members', 'manage', 'Manage company members and roles', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'billing:manage', 'billing', 'manage', 'Manage subscription and resources', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT ("code") DO UPDATE SET
  "module" = EXCLUDED."module",
  "action" = EXCLUDED."action",
  "description" = EXCLUDED."description",
  "updated_at" = CURRENT_TIMESTAMP;

INSERT INTO "recruiter_roles" ("id", "code", "name", "description", "created_at", "updated_at")
VALUES (
  gen_random_uuid(),
  'OWNER',
  'Owner',
  'Chu tai khoan - Toan quyen quan ly',
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
)
ON CONFLICT ("code") DO UPDATE SET
  "name" = EXCLUDED."name",
  "description" = EXCLUDED."description",
  "updated_at" = CURRENT_TIMESTAMP;

INSERT INTO "recruiter_role_permissions" (
  "id",
  "recruiter_role_id",
  "recruiter_permissions_id"
)
SELECT
  gen_random_uuid(),
  owner_role."id",
  permission."id"
FROM "recruiter_roles" owner_role
CROSS JOIN "recruiter_permissions" permission
WHERE owner_role."code" = 'OWNER'
  AND permission."code" IN (
    'jobs:manage',
    'applications:manage',
    'applications:review_assigned',
    'interviews:manage',
    'interviews:review_assigned',
    'company:manage',
    'members:manage',
    'billing:manage'
  )
ON CONFLICT ("recruiter_role_id", "recruiter_permissions_id") DO NOTHING;

UPDATE "recruiter_accounts" account
SET
  "recruiter_role_id" = owner_role."id",
  "updated_at" = CURRENT_TIMESTAMP
FROM "recruiter_roles" owner_role
WHERE owner_role."code" = 'OWNER'
  AND account."company_id" IS NOT NULL
  AND account."recruiter_role_id" IS NULL;

INSERT INTO "company_members" (
  "id",
  "recruiter_account_id",
  "company_id",
  "role_id",
  "status",
  "joined_at",
  "created_at",
  "updated_at"
)
SELECT
  gen_random_uuid(),
  account."id",
  account."company_id",
  owner_role."id",
  'active',
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM "recruiter_accounts" account
CROSS JOIN "recruiter_roles" owner_role
WHERE owner_role."code" = 'OWNER'
  AND account."company_id" IS NOT NULL
  AND account."recruiter_role_id" = owner_role."id"
  AND NOT EXISTS (
    SELECT 1
    FROM "company_members" member
    WHERE member."recruiter_account_id" = account."id"
      AND member."company_id" = account."company_id"
  );
