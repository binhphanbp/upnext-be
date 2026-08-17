-- Marks which postings have already been announced to the company's followers.
--
-- Every existing row is stamped as already announced. Leaving them NULL would make the
-- first sweep after deploy treat the entire published history as new and email every
-- follower about postings they have had months to see — the one failure mode of this
-- feature that cannot be taken back.
ALTER TABLE "job_posts" ADD COLUMN "follower_alert_sent_at" TIMESTAMP(3);

UPDATE "job_posts" SET "follower_alert_sent_at" = NOW();

CREATE INDEX "job_posts_follower_alert_sent_at_published_at_idx"
  ON "job_posts" ("follower_alert_sent_at", "published_at");
