-- CreateEnum
CREATE TYPE "CvScreeningRunStatus" AS ENUM ('pending', 'processing', 'completed', 'failed', 'partial_failed');

-- CreateTable
CREATE TABLE "cv_screening_runs" (
    "id" UUID NOT NULL,
    "job_post_id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "recruiter_account_id" UUID NOT NULL,
    "total_applications" INTEGER NOT NULL DEFAULT 0,
    "processed_count" INTEGER NOT NULL DEFAULT 0,
    "failed_count" INTEGER NOT NULL DEFAULT 0,
    "limit" INTEGER,
    "min_score" DECIMAL(5,2),
    "status" "CvScreeningRunStatus" NOT NULL DEFAULT 'pending',
    "error_message" TEXT,
    "started_at" TIMESTAMP(3),
    "finished_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "cv_screening_runs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "job_embeddings" (
    "id" UUID NOT NULL,
    "job_post_id" UUID NOT NULL,
    "embedding_text" TEXT NOT NULL,
    "embedding_vector" JSONB NOT NULL,
    "model_name" VARCHAR(120) NOT NULL DEFAULT 'gemini-embedding-001',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "job_embeddings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cv_embeddings" (
    "id" UUID NOT NULL,
    "cv_version_id" UUID NOT NULL,
    "candidate_profile_id" UUID NOT NULL,
    "embedding_text" TEXT NOT NULL,
    "embedding_vector" JSONB NOT NULL,
    "model_name" VARCHAR(120) NOT NULL DEFAULT 'gemini-embedding-001',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "cv_embeddings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "application_ai_scores" (
    "id" UUID NOT NULL,
    "run_id" UUID NOT NULL,
    "application_id" UUID NOT NULL,
    "job_post_id" UUID NOT NULL,
    "candidate_profile_id" UUID NOT NULL,
    "semantic_score" DECIMAL(5,2) NOT NULL,
    "ai_score" DECIMAL(5,2) NOT NULL,
    "final_score" DECIMAL(5,2) NOT NULL,
    "skill_score" DECIMAL(5,2) NOT NULL,
    "experience_score" DECIMAL(5,2) NOT NULL,
    "project_score" DECIMAL(5,2) NOT NULL,
    "education_score" DECIMAL(5,2) NOT NULL,
    "matched_skills" JSONB NOT NULL,
    "missing_skills" JSONB NOT NULL,
    "strengths" JSONB NOT NULL,
    "weaknesses" JSONB NOT NULL,
    "summary" TEXT,
    "recommendation" TEXT,
    "raw_ai_response" JSONB,
    "model_name" VARCHAR(120) NOT NULL,
    "scoring_version" VARCHAR(40) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "application_ai_scores_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "cv_screening_runs_job_post_id_created_at_idx" ON "cv_screening_runs"("job_post_id", "created_at");

-- CreateIndex
CREATE INDEX "cv_screening_runs_company_id_created_at_idx" ON "cv_screening_runs"("company_id", "created_at");

-- CreateIndex
CREATE INDEX "cv_screening_runs_recruiter_account_id_created_at_idx" ON "cv_screening_runs"("recruiter_account_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "job_embeddings_job_post_id_key" ON "job_embeddings"("job_post_id");

-- CreateIndex
CREATE INDEX "job_embeddings_model_name_idx" ON "job_embeddings"("model_name");

-- CreateIndex
CREATE UNIQUE INDEX "cv_embeddings_cv_version_id_key" ON "cv_embeddings"("cv_version_id");

-- CreateIndex
CREATE INDEX "cv_embeddings_candidate_profile_id_idx" ON "cv_embeddings"("candidate_profile_id");

-- CreateIndex
CREATE INDEX "cv_embeddings_model_name_idx" ON "cv_embeddings"("model_name");

-- CreateIndex
CREATE UNIQUE INDEX "application_ai_scores_application_id_key" ON "application_ai_scores"("application_id");

-- CreateIndex
CREATE INDEX "application_ai_scores_run_id_final_score_idx" ON "application_ai_scores"("run_id", "final_score");

-- CreateIndex
CREATE INDEX "application_ai_scores_job_post_id_final_score_idx" ON "application_ai_scores"("job_post_id", "final_score");

-- CreateIndex
CREATE INDEX "application_ai_scores_candidate_profile_id_idx" ON "application_ai_scores"("candidate_profile_id");

-- AddForeignKey
ALTER TABLE "cv_screening_runs" ADD CONSTRAINT "cv_screening_runs_job_post_id_fkey" FOREIGN KEY ("job_post_id") REFERENCES "job_posts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cv_screening_runs" ADD CONSTRAINT "cv_screening_runs_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cv_screening_runs" ADD CONSTRAINT "cv_screening_runs_recruiter_account_id_fkey" FOREIGN KEY ("recruiter_account_id") REFERENCES "recruiter_accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "job_embeddings" ADD CONSTRAINT "job_embeddings_job_post_id_fkey" FOREIGN KEY ("job_post_id") REFERENCES "job_posts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cv_embeddings" ADD CONSTRAINT "cv_embeddings_cv_version_id_fkey" FOREIGN KEY ("cv_version_id") REFERENCES "cv_versions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cv_embeddings" ADD CONSTRAINT "cv_embeddings_candidate_profile_id_fkey" FOREIGN KEY ("candidate_profile_id") REFERENCES "candidate_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "application_ai_scores" ADD CONSTRAINT "application_ai_scores_run_id_fkey" FOREIGN KEY ("run_id") REFERENCES "cv_screening_runs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "application_ai_scores" ADD CONSTRAINT "application_ai_scores_application_id_fkey" FOREIGN KEY ("application_id") REFERENCES "applications"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "application_ai_scores" ADD CONSTRAINT "application_ai_scores_job_post_id_fkey" FOREIGN KEY ("job_post_id") REFERENCES "job_posts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "application_ai_scores" ADD CONSTRAINT "application_ai_scores_candidate_profile_id_fkey" FOREIGN KEY ("candidate_profile_id") REFERENCES "candidate_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;
