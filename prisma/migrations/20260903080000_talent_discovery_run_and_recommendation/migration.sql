-- AI Talent Discovery: run và recommendation (§10).
--
-- Bảng MỚI, không tái dùng `talent_recommendation_runs`/`talent_recommendations`:
-- bảng cũ có grain theo CVVersion (một ứng viên nhiều CV chiếm nhiều slot và
-- đụng unique(run, candidate)), không có quota, và serializer của nó trả tên
-- thật. §3 cấm nối UI vào nó. Bảng cũ giữ nguyên cho lịch sử audit theo quy tắc
-- additive của §11.1.
--
-- Trạng thái queue nằm trên chính aggregate, theo khuôn
-- 20260902090000_durable_cv_screening_queue.
--
-- `candidate_profile_id` trên recommendation là FK nội bộ để join; §10 nói rõ
-- serializer recruiter tuyệt đối không gửi value này ra ngoài.

-- CreateEnum
CREATE TYPE "TalentDiscoveryRunStatus" AS ENUM ('pending', 'processing', 'completed', 'failed', 'expired');

-- CreateEnum
CREATE TYPE "TalentDiscoveryMatchBand" AS ENUM ('strong', 'good', 'consider');

-- CreateTable
CREATE TABLE "talent_discovery_runs" (
    "id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "job_post_id" UUID NOT NULL,
    "requested_by_recruiter_id" UUID NOT NULL,
    "status" "TalentDiscoveryRunStatus" NOT NULL DEFAULT 'pending',
    "idempotency_key" VARCHAR(180) NOT NULL,
    "usage_id" UUID,
    "usage_reversed_at" TIMESTAMP(3),
    "matching_fingerprint" VARCHAR(64) NOT NULL,
    "fingerprint_version" VARCHAR(40) NOT NULL,
    "job_snapshot" JSONB NOT NULL,
    "scoring_config" JSONB NOT NULL,
    "scoring_version" VARCHAR(40) NOT NULL,
    "index_embedding_version" VARCHAR(80) NOT NULL,
    "masking_policy_version" VARCHAR(40) NOT NULL,
    "max_results" INTEGER NOT NULL,
    "result_count" INTEGER NOT NULL DEFAULT 0,
    "supply_reason" VARCHAR(40),
    "eligibility_checked_at" TIMESTAMP(3),
    "snapshot_expires_at" TIMESTAMP(3) NOT NULL,
    "attempt_count" INTEGER NOT NULL DEFAULT 0,
    "next_attempt_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "locked_at" TIMESTAMP(3),
    "locked_by" VARCHAR(100),
    "error_code" VARCHAR(80),
    "error_message" TEXT,
    "started_at" TIMESTAMP(3),
    "finished_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "talent_discovery_runs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "talent_discovery_recommendations" (
    "id" UUID NOT NULL,
    "run_id" UUID NOT NULL,
    "job_post_id" UUID NOT NULL,
    "candidate_profile_id" UUID NOT NULL,
    "candidate_ref" VARCHAR(64) NOT NULL,
    "alias" VARCHAR(32) NOT NULL,
    "rank" INTEGER NOT NULL,
    "score" DECIMAL(5,2) NOT NULL,
    "match_band" "TalentDiscoveryMatchBand" NOT NULL,
    "score_breakdown" JSONB NOT NULL,
    "reason_codes" JSONB NOT NULL,
    "gap_codes" JSONB NOT NULL,
    "matched_skill_ids" UUID[],
    "experience_months" INTEGER NOT NULL DEFAULT 0,
    "city" VARCHAR(100),
    "working_model" "WorkingModel",
    "index_snapshot" JSONB NOT NULL,
    "generated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "talent_discovery_recommendations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "talent_discovery_runs_idempotency_key_key" ON "talent_discovery_runs"("idempotency_key");

-- CreateIndex
CREATE UNIQUE INDEX "talent_discovery_runs_usage_id_key" ON "talent_discovery_runs"("usage_id");

-- CreateIndex
CREATE INDEX "talent_discovery_runs_job_post_id_status_created_at_idx" ON "talent_discovery_runs"("job_post_id", "status", "created_at");

-- CreateIndex
CREATE INDEX "talent_discovery_runs_company_id_created_at_idx" ON "talent_discovery_runs"("company_id", "created_at");

-- CreateIndex
CREATE INDEX "talent_discovery_runs_job_post_id_matching_fingerprint_stat_idx" ON "talent_discovery_runs"("job_post_id", "matching_fingerprint", "status");

-- CreateIndex
CREATE INDEX "talent_discovery_runs_status_snapshot_expires_at_idx" ON "talent_discovery_runs"("status", "snapshot_expires_at");

-- CreateIndex
CREATE INDEX "talent_discovery_runs_status_next_attempt_at_created_at_idx" ON "talent_discovery_runs"("status", "next_attempt_at", "created_at");

-- CreateIndex
CREATE INDEX "talent_discovery_runs_status_locked_at_idx" ON "talent_discovery_runs"("status", "locked_at");

-- CreateIndex
CREATE INDEX "talent_discovery_recommendations_run_id_rank_idx" ON "talent_discovery_recommendations"("run_id", "rank");

-- CreateIndex
CREATE UNIQUE INDEX "talent_discovery_recommendations_run_id_candidate_profile_i_key" ON "talent_discovery_recommendations"("run_id", "candidate_profile_id");

-- CreateIndex
CREATE UNIQUE INDEX "talent_discovery_recommendations_run_id_alias_key" ON "talent_discovery_recommendations"("run_id", "alias");

-- AddForeignKey
ALTER TABLE "talent_discovery_recommendations" ADD CONSTRAINT "talent_discovery_recommendations_run_id_fkey" FOREIGN KEY ("run_id") REFERENCES "talent_discovery_runs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

