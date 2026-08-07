-- CV screening no longer runs a semantic retrieval stage: every application is
-- scored by Gemini directly, so the stored semantic similarity and the
-- semantic-score threshold are both obsolete.
--
-- job_embeddings / cv_embeddings are intentionally left in place: they are
-- still used by talent-outreach recommendations and job-post salary insights.

-- AlterTable
ALTER TABLE "application_ai_scores" DROP COLUMN "semantic_score";

-- AlterTable
ALTER TABLE "cv_screening_runs" DROP COLUMN "min_score";
