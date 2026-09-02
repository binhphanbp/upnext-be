-- Drops the shortlist/passing-score config: how many CVs a run scores is
-- chosen per run on the screening screen (Top 10/Top 20), and the passing
-- score was a label recruiters did not need configured up front.

-- AlterTable
ALTER TABLE "application_ai_scores" DROP COLUMN "meets_passing_score",
DROP COLUMN "passing_score";

-- AlterTable
ALTER TABLE "cv_screening_company_configs" DROP COLUMN "default_top_n",
DROP COLUMN "passing_score";

-- AlterTable
ALTER TABLE "job_post_cv_screening_configs" DROP COLUMN "default_top_n",
DROP COLUMN "passing_score";
