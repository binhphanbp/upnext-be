CREATE TABLE "job_post_access_revocations" (
    "id" UUID NOT NULL,
    "job_post_id" UUID NOT NULL,
    "recruiter_account_id" UUID NOT NULL,
    "revoked_by_recruiter_id" UUID NOT NULL,
    "revoked_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "job_post_access_revocations_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "job_post_access_revocations_job_post_id_recruiter_account_id_key"
ON "job_post_access_revocations"("job_post_id", "recruiter_account_id");

CREATE INDEX "job_post_access_revocations_recruiter_account_id_idx"
ON "job_post_access_revocations"("recruiter_account_id");

ALTER TABLE "job_post_access_revocations"
ADD CONSTRAINT "job_post_access_revocations_job_post_id_fkey"
FOREIGN KEY ("job_post_id") REFERENCES "job_posts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "job_post_access_revocations"
ADD CONSTRAINT "job_post_access_revocations_recruiter_account_id_fkey"
FOREIGN KEY ("recruiter_account_id") REFERENCES "recruiter_accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
