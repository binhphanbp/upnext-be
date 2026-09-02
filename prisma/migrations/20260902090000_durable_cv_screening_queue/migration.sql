-- A screening run is also a durable PostgreSQL work item.  Keeping queue state
-- on the aggregate means a restart cannot lose a paid screening request and
-- avoids introducing a second broker before Redis is operated in this stack.
ALTER TABLE "cv_screening_runs"
  ADD COLUMN "attempt_count" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "next_attempt_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ADD COLUMN "locked_at" TIMESTAMP(3),
  ADD COLUMN "locked_by" VARCHAR(100),
  ADD COLUMN "application_ids" JSONB NOT NULL DEFAULT '[]';

CREATE INDEX "cv_screening_runs_status_next_attempt_at_created_at_idx"
  ON "cv_screening_runs"("status", "next_attempt_at", "created_at");

CREATE INDEX "cv_screening_runs_status_locked_at_idx"
  ON "cv_screening_runs"("status", "locked_at");
