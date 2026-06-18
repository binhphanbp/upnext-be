-- Allow company invitations to be addressed to emails that do not yet have a recruiter account.
ALTER TABLE "company_members"
ADD COLUMN "invited_email" VARCHAR(255);

UPDATE "company_members" AS cm
SET "invited_email" = ra."email"
FROM "recruiter_accounts" AS ra
WHERE cm."recruiter_account_id" = ra."id"
  AND cm."invited_email" IS NULL;

ALTER TABLE "company_members"
DROP CONSTRAINT "company_members_recruiter_account_id_fkey";

ALTER TABLE "company_members"
ALTER COLUMN "recruiter_account_id" DROP NOT NULL;

ALTER TABLE "company_members"
ADD CONSTRAINT "company_members_recruiter_account_id_fkey"
FOREIGN KEY ("recruiter_account_id") REFERENCES "recruiter_accounts"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

CREATE UNIQUE INDEX "company_members_invited_email_company_id_key"
ON "company_members"("invited_email", "company_id");
