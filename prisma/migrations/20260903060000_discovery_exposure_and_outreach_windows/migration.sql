-- AI Talent Discovery: cooldown liên hệ và cửa sổ phơi bày (§4.2, §6.3).
--
-- `candidate_discovery_exposure_windows` là nơi enforce, không phải bảng event:
-- một dòng mở đúng 30 ngày ở lần lộ diện đầu tiên và unique theo
-- (candidate, company), nên `count(... WHERE next_eligible_at > now())` chính là
-- số công ty distinct trong 30 ngày. Một aggregate rolling-window trở thành một
-- `count` trên index -- xem index `(candidate_profile_id, next_eligible_at)`.
--
-- Cố ý KHÔNG có FK cho `run_id` / `recommendation_id` / `last_recommendation_id`:
-- snapshot recommendation có TTL 30 ngày và sẽ bị dọn, nhưng cooldown và lịch sử
-- phơi bày phải sống lâu hơn thế.
--
-- Additive: chỉ thêm bảng và index.

-- CreateTable
CREATE TABLE "company_candidate_outreach_windows" (
    "id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "candidate_profile_id" UUID NOT NULL,
    "last_contacted_at" TIMESTAMP(3) NOT NULL,
    "next_eligible_at" TIMESTAMP(3) NOT NULL,
    "last_recommendation_id" UUID,
    "last_job_post_id" UUID,
    "contact_count" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "company_candidate_outreach_windows_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "candidate_discovery_exposure_windows" (
    "id" UUID NOT NULL,
    "candidate_profile_id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "first_exposed_at" TIMESTAMP(3) NOT NULL,
    "last_exposed_at" TIMESTAMP(3) NOT NULL,
    "next_eligible_at" TIMESTAMP(3) NOT NULL,
    "exposure_count" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "candidate_discovery_exposure_windows_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "candidate_discovery_exposure_events" (
    "id" UUID NOT NULL,
    "candidate_profile_id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "run_id" UUID,
    "job_post_id" UUID,
    "recommendation_id" UUID,
    "exposed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "candidate_discovery_exposure_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "company_candidate_outreach_windows_next_eligible_at_idx" ON "company_candidate_outreach_windows"("next_eligible_at");

-- CreateIndex
CREATE UNIQUE INDEX "company_candidate_outreach_windows_company_id_candidate_pro_key" ON "company_candidate_outreach_windows"("company_id", "candidate_profile_id");

-- CreateIndex
CREATE INDEX "candidate_discovery_exposure_windows_candidate_profile_id_n_idx" ON "candidate_discovery_exposure_windows"("candidate_profile_id", "next_eligible_at");

-- CreateIndex
CREATE UNIQUE INDEX "candidate_discovery_exposure_windows_candidate_profile_id_c_key" ON "candidate_discovery_exposure_windows"("candidate_profile_id", "company_id");

-- CreateIndex
CREATE INDEX "candidate_discovery_exposure_events_candidate_profile_id_ex_idx" ON "candidate_discovery_exposure_events"("candidate_profile_id", "exposed_at");

-- CreateIndex
CREATE INDEX "candidate_discovery_exposure_events_company_id_exposed_at_idx" ON "candidate_discovery_exposure_events"("company_id", "exposed_at");

-- CreateIndex
CREATE INDEX "candidate_discovery_exposure_events_run_id_idx" ON "candidate_discovery_exposure_events"("run_id");

