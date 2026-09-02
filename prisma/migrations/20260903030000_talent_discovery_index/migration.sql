-- AI Talent Discovery: chỉ mục tìm kiếm không-PII, một dòng mỗi ứng viên (§7.1).
--
-- Trạng thái queue nằm trên chính aggregate (`attempt_count`, `next_attempt_at`,
-- `locked_at`, `locked_by`), theo đúng khuôn migration
-- 20260902090000_durable_cv_screening_queue đã thiết lập. Với bảng này, unique
-- trên `candidate_profile_id` khiến chính dòng index là cơ chế dedupe: đặt
-- `status='pending'` 50 lần vẫn chỉ là một lần rebuild.
--
-- Additive: chỉ thêm enum, bảng và index.

-- CreateEnum
CREATE TYPE "DiscoveryIndexStatus" AS ENUM ('pending', 'active', 'inactive', 'failed');

-- CreateTable
CREATE TABLE "talent_discovery_indexes" (
    "id" UUID NOT NULL,
    "candidate_profile_id" UUID NOT NULL,
    "status" "DiscoveryIndexStatus" NOT NULL DEFAULT 'pending',
    "sanitized_text" TEXT NOT NULL,
    "embedding_vector" JSONB,
    "embedding_model" VARCHAR(120) NOT NULL DEFAULT '',
    "embedding_version" VARCHAR(80) NOT NULL DEFAULT '',
    "sanitizer_version" VARCHAR(40) NOT NULL DEFAULT '',
    "source_profile_version" VARCHAR(64) NOT NULL,
    "allowed_job_category_ids" UUID[],
    "cities" VARCHAR(100)[],
    "working_models" "WorkingModel"[],
    "experience_months" INTEGER NOT NULL DEFAULT 0,
    "desired_level_id" UUID,
    "salary_min" DECIMAL(12,2),
    "salary_max" DECIMAL(12,2),
    "salary_currency" VARCHAR(10),
    "allow_redacted_cv_view" BOOLEAN NOT NULL DEFAULT false,
    "attempt_count" INTEGER NOT NULL DEFAULT 0,
    "next_attempt_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "locked_at" TIMESTAMP(3),
    "locked_by" VARCHAR(100),
    "last_error" TEXT,
    "indexed_at" TIMESTAMP(3),
    "deactivated_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "talent_discovery_indexes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "talent_discovery_indexes_candidate_profile_id_key" ON "talent_discovery_indexes"("candidate_profile_id");

-- CreateIndex
CREATE INDEX "talent_discovery_indexes_status_next_attempt_at_created_at_idx" ON "talent_discovery_indexes"("status", "next_attempt_at", "created_at");

-- CreateIndex
CREATE INDEX "talent_discovery_indexes_status_locked_at_idx" ON "talent_discovery_indexes"("status", "locked_at");

-- CreateIndex
CREATE INDEX "talent_discovery_indexes_status_embedding_version_idx" ON "talent_discovery_indexes"("status", "embedding_version");

-- AddForeignKey
ALTER TABLE "talent_discovery_indexes" ADD CONSTRAINT "talent_discovery_indexes_candidate_profile_id_fkey" FOREIGN KEY ("candidate_profile_id") REFERENCES "candidate_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

