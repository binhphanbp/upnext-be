-- AI Talent Discovery: consent riêng cho candidate (§4.1).
--
-- Additive: chỉ tạo enum, bảng và index mới. Không sửa/xoá cột nào của
-- `candidate_contact_preferences` -- consent direct-contact cũ vẫn là bằng
-- chứng cho luồng cũ, và §3/§11.3 cấm suy ra consent Discovery từ nó.
--
-- `consent_version` là NOT NULL và không có DEFAULT có chủ ý: một dòng ở bảng
-- này là bằng chứng ai đó đã đồng ý với một bản văn cụ thể.

-- CreateEnum
CREATE TYPE "DiscoveryConsentStatus" AS ENUM ('disabled', 'enabled');

-- CreateEnum
CREATE TYPE "DiscoverySalaryVisibility" AS ENUM ('hide', 'range_only');

-- CreateTable
CREATE TABLE "candidate_talent_discovery_preferences" (
    "candidate_profile_id" UUID NOT NULL,
    "status" "DiscoveryConsentStatus" NOT NULL DEFAULT 'disabled',
    "consent_version" VARCHAR(40) NOT NULL,
    "consented_at" TIMESTAMP(3),
    "revoked_at" TIMESTAMP(3),
    "allow_invitations" BOOLEAN NOT NULL DEFAULT true,
    "allow_redacted_cv_view" BOOLEAN NOT NULL DEFAULT false,
    "allowed_job_families" JSONB,
    "allowed_cities" JSONB,
    "allowed_working_models" JSONB,
    "salary_visibility" "DiscoverySalaryVisibility" NOT NULL DEFAULT 'hide',
    "notice_period_visible" BOOLEAN NOT NULL DEFAULT false,
    "last_reviewed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "candidate_talent_discovery_preferences_pkey" PRIMARY KEY ("candidate_profile_id")
);

-- CreateIndex
CREATE INDEX "candidate_talent_discovery_preferences_status_idx" ON "candidate_talent_discovery_preferences"("status");

-- Predicate eligibility của Discovery (§4.2) lọc đồng thời hai cột này; hai
-- index đơn lẻ có sẵn không phục vụ được. Index này KHÔNG phục vụ đường
-- pgvector -- đường đó chạy trên `talent_discovery_indexes`.
-- CreateIndex
CREATE INDEX "candidate_profiles_job_search_status_profile_visibility_upd_idx" ON "candidate_profiles"("job_search_status", "profile_visibility", "updated_at");

-- AddForeignKey
ALTER TABLE "candidate_talent_discovery_preferences" ADD CONSTRAINT "candidate_talent_discovery_preferences_candidate_profile_i_fkey" FOREIGN KEY ("candidate_profile_id") REFERENCES "candidate_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

