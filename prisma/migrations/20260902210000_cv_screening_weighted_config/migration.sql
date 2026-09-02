-- AlterTable: the run now snapshots the config it was created with
ALTER TABLE "cv_screening_runs" ADD COLUMN     "config_snapshot" JSONB;

-- AlterTable: each score snapshots the weights/threshold it was computed with
-- (NULL on pre-existing rows = the fixed 40/30/20/10 reference rubric, which
-- is exactly what they were scored with, so no backfill is needed).
ALTER TABLE "application_ai_scores" ADD COLUMN     "meets_passing_score" BOOLEAN,
ADD COLUMN     "must_have_results" JSONB,
ADD COLUMN     "nice_to_have_results" JSONB,
ADD COLUMN     "passing_score" INTEGER,
ADD COLUMN     "prompt_fingerprint" VARCHAR(64),
ADD COLUMN     "scoring_weights" JSONB;

-- AlterTable: company config gains weights + real hiring criteria.
-- The new columns are added BEFORE the old ones are dropped so the three
-- per-rubric-group instruction fields can be merged into the single
-- custom_prompt field instead of being thrown away.
ALTER TABLE "cv_screening_company_configs" ADD COLUMN     "custom_prompt" TEXT,
ADD COLUMN     "must_have_criteria" JSONB,
ADD COLUMN     "nice_to_have_criteria" JSONB,
ADD COLUMN     "passing_score" INTEGER,
ADD COLUMN     "weight_education" INTEGER,
ADD COLUMN     "weight_experience" INTEGER,
ADD COLUMN     "weight_preset" VARCHAR(20),
ADD COLUMN     "weight_projects" INTEGER,
ADD COLUMN     "weight_skills" INTEGER;

UPDATE "cv_screening_company_configs"
SET "custom_prompt" = NULLIF(
      concat_ws(
        E'\n',
        NULLIF(btrim("skills_instructions"), ''),
        NULLIF(btrim("experience_instructions"), ''),
        NULLIF(btrim("projects_instructions"), '')
      ),
      ''
    )
WHERE COALESCE(btrim("skills_instructions"), '') <> ''
   OR COALESCE(btrim("experience_instructions"), '') <> ''
   OR COALESCE(btrim("projects_instructions"), '') <> '';

-- A company that had opted out of education scoring now expresses that as a
-- 0% education weight, with the freed points going to skills.
UPDATE "cv_screening_company_configs"
SET "weight_skills" = 50,
    "weight_experience" = 30,
    "weight_projects" = 20,
    "weight_education" = 0,
    "weight_preset" = 'CUSTOM'
WHERE "ignore_education_requirement" = true;

ALTER TABLE "cv_screening_company_configs" DROP COLUMN "experience_instructions",
DROP COLUMN "ignore_education_requirement",
DROP COLUMN "min_similarity_score",
DROP COLUMN "projects_instructions",
DROP COLUMN "skills_instructions";

-- CreateTable: per-job-post override of the company defaults
CREATE TABLE "job_post_cv_screening_configs" (
    "job_post_id" UUID NOT NULL,
    "weight_skills" INTEGER,
    "weight_experience" INTEGER,
    "weight_projects" INTEGER,
    "weight_education" INTEGER,
    "weight_preset" VARCHAR(20),
    "must_have_criteria" JSONB,
    "nice_to_have_criteria" JSONB,
    "custom_prompt" TEXT,
    "passing_score" INTEGER,
    "default_top_n" INTEGER,
    "updated_by_account_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "job_post_cv_screening_configs_pkey" PRIMARY KEY ("job_post_id")
);

-- AddForeignKey
ALTER TABLE "job_post_cv_screening_configs" ADD CONSTRAINT "job_post_cv_screening_configs_job_post_id_fkey" FOREIGN KEY ("job_post_id") REFERENCES "job_posts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
