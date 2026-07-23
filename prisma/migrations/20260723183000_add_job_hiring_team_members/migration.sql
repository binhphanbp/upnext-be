-- A job hiring team is separate from application assignments. Members added
-- here are automatically included in existing and future application chats for
-- the job; the recruiter who authored the job remains implicit in the flow.
CREATE TABLE "job_hiring_team_members" (
    "id" UUID NOT NULL,
    "job_post_id" UUID NOT NULL,
    "recruiter_account_id" UUID NOT NULL,
    "added_by_recruiter_id" UUID,
    "joined_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "left_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "job_hiring_team_members_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "job_hiring_team_members_job_post_id_recruiter_account_id_key"
ON "job_hiring_team_members"("job_post_id", "recruiter_account_id");

CREATE INDEX "job_hiring_team_members_job_post_id_left_at_idx"
ON "job_hiring_team_members"("job_post_id", "left_at");

CREATE INDEX "job_hiring_team_members_recruiter_account_id_left_at_idx"
ON "job_hiring_team_members"("recruiter_account_id", "left_at");

ALTER TABLE "job_hiring_team_members"
ADD CONSTRAINT "job_hiring_team_members_job_post_id_fkey"
FOREIGN KEY ("job_post_id") REFERENCES "job_posts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "job_hiring_team_members"
ADD CONSTRAINT "job_hiring_team_members_recruiter_account_id_fkey"
FOREIGN KEY ("recruiter_account_id") REFERENCES "recruiter_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
