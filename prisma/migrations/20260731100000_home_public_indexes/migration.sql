CREATE INDEX IF NOT EXISTS "job_posts_public_home_idx"
  ON "job_posts" ("status", "moderation_status", "published_at", "expired_at");

CREATE INDEX IF NOT EXISTS "applications_job_post_submitted_at_idx"
  ON "applications" ("job_post_id", "submitted_at");

CREATE INDEX IF NOT EXISTS "saved_jobs_job_post_created_at_idx"
  ON "saved_jobs" ("job_post_id", "created_at");

CREATE INDEX IF NOT EXISTS "posts_status_created_at_idx"
  ON "posts" ("status", "created_at");
