-- AlterTable
ALTER TABLE "posts" ADD COLUMN     "view_count" INTEGER NOT NULL DEFAULT 0;

-- RenameIndex
ALTER INDEX "job_post_access_revocations_job_post_id_recruiter_account_id_ke" RENAME TO "job_post_access_revocations_job_post_id_recruiter_account_i_key";
