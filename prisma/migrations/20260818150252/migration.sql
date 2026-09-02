-- DropIndex
DROP INDEX "applications_offer_deadline_at_idx";

-- DropIndex
DROP INDEX "reports_reporter_recruiter_account_id_idx";

-- RenameIndex
ALTER INDEX "ai_conversations_candidate_profile_id_is_archived_updated_at_id" RENAME TO "ai_conversations_candidate_profile_id_is_archived_updated_a_idx";

-- RenameIndex
ALTER INDEX "applications_job_post_submitted_at_idx" RENAME TO "applications_job_post_id_submitted_at_idx";

-- RenameIndex
ALTER INDEX "job_posts_public_home_idx" RENAME TO "job_posts_status_moderation_status_published_at_expired_at_idx";

-- RenameIndex
ALTER INDEX "saved_jobs_job_post_created_at_idx" RENAME TO "saved_jobs_job_post_id_created_at_idx";
