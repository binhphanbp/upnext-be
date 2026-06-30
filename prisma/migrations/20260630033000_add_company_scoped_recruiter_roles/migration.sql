ALTER TABLE "recruiter_roles" ADD COLUMN "company_id" UUID;

CREATE INDEX "recruiter_roles_company_id_idx" ON "recruiter_roles"("company_id");

ALTER TABLE "recruiter_roles"
ADD CONSTRAINT "recruiter_roles_company_id_fkey"
FOREIGN KEY ("company_id") REFERENCES "companies"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
