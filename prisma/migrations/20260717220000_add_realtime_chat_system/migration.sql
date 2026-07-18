-- CreateEnum
CREATE TYPE "ConversationType" AS ENUM ('application_chat', 'talent_outreach', 'support');

-- CreateEnum
CREATE TYPE "ConversationStatus" AS ENUM ('pending', 'active', 'read_only', 'closed');

-- CreateEnum
CREATE TYPE "ConversationParticipantRole" AS ENUM ('candidate', 'recruiter', 'admin', 'observer');

-- CreateEnum
CREATE TYPE "MessageType" AS ENUM ('text', 'attachment', 'mixed', 'system');

-- CreateEnum
CREATE TYPE "MessageAttachmentStatus" AS ENUM ('uploaded', 'claimed', 'quarantined', 'deleted');

-- CreateEnum
CREATE TYPE "TalentRecommendationRunStatus" AS ENUM ('pending', 'processing', 'completed', 'failed');

-- CreateEnum
CREATE TYPE "TalentContactStatus" AS ENUM ('pending', 'accepted', 'declined', 'expired', 'blocked', 'closed');

-- CreateEnum
CREATE TYPE "TalentContactAttemptOutcome" AS ENUM ('pending', 'accepted', 'declined', 'expired', 'cancelled', 'blocked');

-- CreateEnum
CREATE TYPE "CandidateContactPreferenceStatus" AS ENUM ('opted_out', 'opted_in');

-- CreateEnum
CREATE TYPE "SupportDepartment" AS ENUM ('sales', 'billing', 'job_review', 'company_verification', 'technical', 'general');

-- CreateEnum
CREATE TYPE "SupportCaseStatus" AS ENUM ('new', 'in_progress', 'waiting_on_recruiter', 'waiting_on_support', 'resolved', 'closed');

-- CreateEnum
CREATE TYPE "SupportPriority" AS ENUM ('low', 'normal', 'high', 'urgent');

-- CreateEnum
CREATE TYPE "SupportAssignmentAction" AS ENUM ('claim', 'transfer', 'unassign');

-- CreateEnum
CREATE TYPE "SubscriptionFeature" AS ENUM ('talent_contact');

-- CreateEnum
CREATE TYPE "SubscriptionUsageDirection" AS ENUM ('consume', 'reversal');

-- CreateEnum
CREATE TYPE "OutboxStatus" AS ENUM ('pending', 'processing', 'processed', 'failed');

-- AlterTable
ALTER TABLE "applications" ADD COLUMN     "version" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "notifications" ADD COLUMN     "body" TEXT,
ADD COLUMN     "dedupe_key" VARCHAR(180),
ADD COLUMN     "metadata" JSONB;

-- AlterTable
ALTER TABLE "subscription_plans" ADD COLUMN     "talent_contact_limit" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "company_subscriptions" ADD COLUMN     "talent_contact_limit" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "talent_contact_used" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "conversations" (
    "id" UUID NOT NULL,
    "type" "ConversationType" NOT NULL,
    "status" "ConversationStatus" NOT NULL DEFAULT 'active',
    "company_id" UUID,
    "application_id" UUID,
    "job_post_id" UUID,
    "latest_message_id" UUID,
    "latest_message_at" TIMESTAMP(3),
    "writable_until" TIMESTAMP(3),
    "read_only_at" TIMESTAMP(3),
    "closed_at" TIMESTAMP(3),
    "close_reason" VARCHAR(120),
    "created_by_actor_type" "ActorType" NOT NULL,
    "created_by_actor_id" UUID,
    "metadata" JSONB,
    "version" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "conversations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "conversation_participants" (
    "id" UUID NOT NULL,
    "conversation_id" UUID NOT NULL,
    "candidate_account_id" UUID,
    "recruiter_account_id" UUID,
    "admin_user_id" UUID,
    "role" "ConversationParticipantRole" NOT NULL,
    "joined_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "left_at" TIMESTAMP(3),
    "archived_at" TIMESTAMP(3),
    "muted_until" TIMESTAMP(3),
    "last_read_message_id" UUID,
    "last_read_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "conversation_participants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "messages" (
    "id" UUID NOT NULL,
    "conversation_id" UUID NOT NULL,
    "sender_participant_id" UUID,
    "client_message_id" VARCHAR(100),
    "type" "MessageType" NOT NULL DEFAULT 'text',
    "content" TEXT,
    "reply_to_message_id" UUID,
    "system_event_type" VARCHAR(120),
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "edited_at" TIMESTAMP(3),
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "message_attachments" (
    "id" UUID NOT NULL,
    "conversation_id" UUID NOT NULL,
    "file_asset_id" UUID NOT NULL,
    "uploaded_by_participant_id" UUID NOT NULL,
    "message_id" UUID,
    "status" "MessageAttachmentStatus" NOT NULL DEFAULT 'uploaded',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "claimed_at" TIMESTAMP(3),
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "message_attachments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "application_assignments" (
    "id" UUID NOT NULL,
    "application_id" UUID NOT NULL,
    "recruiter_account_id" UUID NOT NULL,
    "assigned_by_actor_type" "ActorType" NOT NULL,
    "assigned_by_actor_id" UUID,
    "assigned_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "unassigned_at" TIMESTAMP(3),
    "reason" TEXT,

    CONSTRAINT "application_assignments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "candidate_contact_preferences" (
    "candidate_profile_id" UUID NOT NULL,
    "status" "CandidateContactPreferenceStatus" NOT NULL DEFAULT 'opted_out',
    "allowed_channels" JSONB,
    "consent_version" VARCHAR(40),
    "updated_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "candidate_contact_preferences_pkey" PRIMARY KEY ("candidate_profile_id")
);

-- CreateTable
CREATE TABLE "company_candidate_blocks" (
    "id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "candidate_profile_id" UUID NOT NULL,
    "created_by_candidate_account_id" UUID NOT NULL,
    "reason_code" VARCHAR(80),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revoked_at" TIMESTAMP(3),

    CONSTRAINT "company_candidate_blocks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "talent_recommendation_runs" (
    "id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "job_post_id" UUID NOT NULL,
    "requested_by_recruiter_id" UUID NOT NULL,
    "status" "TalentRecommendationRunStatus" NOT NULL DEFAULT 'pending',
    "scoring_config" JSONB,
    "scoring_version" VARCHAR(40) NOT NULL DEFAULT 'v1',
    "error_message" TEXT,
    "started_at" TIMESTAMP(3),
    "finished_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "talent_recommendation_runs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "talent_recommendations" (
    "id" UUID NOT NULL,
    "run_id" UUID NOT NULL,
    "job_post_id" UUID NOT NULL,
    "candidate_profile_id" UUID NOT NULL,
    "score" DECIMAL(5,2) NOT NULL,
    "rank" INTEGER NOT NULL,
    "score_breakdown" JSONB,
    "explanation" TEXT,
    "generated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "talent_recommendations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "talent_contact_requests" (
    "id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "candidate_profile_id" UUID NOT NULL,
    "job_post_id" UUID NOT NULL,
    "conversation_id" UUID NOT NULL,
    "current_attempt_id" UUID,
    "status" "TalentContactStatus" NOT NULL DEFAULT 'pending',
    "expires_at" TIMESTAMP(3) NOT NULL,
    "responded_at" TIMESTAMP(3),
    "blocked_at" TIMESTAMP(3),
    "closed_at" TIMESTAMP(3),
    "version" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "talent_contact_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "talent_contact_attempts" (
    "id" UUID NOT NULL,
    "request_id" UUID NOT NULL,
    "sent_by_recruiter_id" UUID NOT NULL,
    "intro_message_id" UUID NOT NULL,
    "quota_usage_id" UUID NOT NULL,
    "client_request_id" VARCHAR(100) NOT NULL,
    "sent_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "responded_at" TIMESTAMP(3),
    "outcome" "TalentContactAttemptOutcome" NOT NULL DEFAULT 'pending',

    CONSTRAINT "talent_contact_attempts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "support_cases" (
    "id" UUID NOT NULL,
    "case_number" VARCHAR(30) NOT NULL,
    "client_request_id" VARCHAR(100) NOT NULL,
    "conversation_id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "created_by_recruiter_id" UUID NOT NULL,
    "assigned_admin_user_id" UUID,
    "job_post_id" UUID,
    "invoice_id" UUID,
    "company_subscription_id" UUID,
    "department" "SupportDepartment" NOT NULL,
    "category_code" VARCHAR(100) NOT NULL,
    "priority" "SupportPriority" NOT NULL DEFAULT 'normal',
    "status" "SupportCaseStatus" NOT NULL DEFAULT 'new',
    "title" VARCHAR(200) NOT NULL,
    "description" TEXT NOT NULL,
    "details" JSONB,
    "resolution_code" VARCHAR(100),
    "resolution_summary" TEXT,
    "last_requester_message_at" TIMESTAMP(3),
    "last_admin_message_at" TIMESTAMP(3),
    "resolved_at" TIMESTAMP(3),
    "closed_at" TIMESTAMP(3),
    "version" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "support_cases_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "support_case_assignment_histories" (
    "id" UUID NOT NULL,
    "case_id" UUID NOT NULL,
    "from_admin_user_id" UUID,
    "to_admin_user_id" UUID,
    "action" "SupportAssignmentAction" NOT NULL,
    "performed_by_actor_type" "ActorType" NOT NULL,
    "performed_by_actor_id" UUID,
    "reason" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "support_case_assignment_histories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "support_case_status_histories" (
    "id" UUID NOT NULL,
    "case_id" UUID NOT NULL,
    "from_status" "SupportCaseStatus",
    "to_status" "SupportCaseStatus" NOT NULL,
    "actor_type" "ActorType" NOT NULL,
    "actor_id" UUID,
    "reason" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "support_case_status_histories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "subscription_usages" (
    "id" UUID NOT NULL,
    "company_subscription_id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "feature" "SubscriptionFeature" NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "direction" "SubscriptionUsageDirection" NOT NULL DEFAULT 'consume',
    "reference_type" VARCHAR(80) NOT NULL,
    "reference_id" UUID NOT NULL,
    "idempotency_key" VARCHAR(180) NOT NULL,
    "created_by_recruiter_id" UUID,
    "reversed_usage_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "subscription_usages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "outbox_events" (
    "id" UUID NOT NULL,
    "aggregate_type" VARCHAR(80) NOT NULL,
    "aggregate_id" UUID NOT NULL,
    "event_type" VARCHAR(120) NOT NULL,
    "dedupe_key" VARCHAR(180) NOT NULL,
    "payload" JSONB NOT NULL,
    "status" "OutboxStatus" NOT NULL DEFAULT 'pending',
    "attempt_count" INTEGER NOT NULL DEFAULT 0,
    "next_attempt_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "locked_at" TIMESTAMP(3),
    "locked_by" VARCHAR(100),
    "processed_at" TIMESTAMP(3),
    "last_error" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "outbox_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "conversations_application_id_key" ON "conversations"("application_id");

-- CreateIndex
CREATE UNIQUE INDEX "conversations_latest_message_id_key" ON "conversations"("latest_message_id");

-- CreateIndex
CREATE INDEX "conversations_company_id_type_status_latest_message_at_id_idx" ON "conversations"("company_id", "type", "status", "latest_message_at", "id");

-- Index used by actor-scoped inbox pagination after the participant join.
CREATE INDEX "conversations_type_status_updated_at_id_idx" ON "conversations"("type", "status", "updated_at", "id");

-- CreateIndex
CREATE INDEX "conversations_status_writable_until_idx" ON "conversations"("status", "writable_until");

-- CreateIndex
CREATE INDEX "conversations_job_post_id_idx" ON "conversations"("job_post_id");

-- CreateIndex
CREATE INDEX "conversation_participants_candidate_account_id_left_at_conv_idx" ON "conversation_participants"("candidate_account_id", "left_at", "conversation_id");

-- CreateIndex
CREATE INDEX "conversation_participants_recruiter_account_id_left_at_conv_idx" ON "conversation_participants"("recruiter_account_id", "left_at", "conversation_id");

-- CreateIndex
CREATE INDEX "conversation_participants_admin_user_id_left_at_conversatio_idx" ON "conversation_participants"("admin_user_id", "left_at", "conversation_id");

-- CreateIndex
CREATE UNIQUE INDEX "conversation_participants_conversation_id_candidate_account_key" ON "conversation_participants"("conversation_id", "candidate_account_id");

-- CreateIndex
CREATE UNIQUE INDEX "conversation_participants_conversation_id_recruiter_account_key" ON "conversation_participants"("conversation_id", "recruiter_account_id");

-- CreateIndex
CREATE UNIQUE INDEX "conversation_participants_conversation_id_admin_user_id_key" ON "conversation_participants"("conversation_id", "admin_user_id");

-- CreateIndex
CREATE INDEX "messages_conversation_id_created_at_id_idx" ON "messages"("conversation_id", "created_at", "id");

-- CreateIndex
CREATE INDEX "messages_reply_to_message_id_idx" ON "messages"("reply_to_message_id");

-- CreateIndex
CREATE UNIQUE INDEX "messages_sender_participant_id_client_message_id_key" ON "messages"("sender_participant_id", "client_message_id");

-- CreateIndex
CREATE UNIQUE INDEX "message_attachments_file_asset_id_key" ON "message_attachments"("file_asset_id");

-- CreateIndex
CREATE INDEX "message_attachments_conversation_id_status_created_at_idx" ON "message_attachments"("conversation_id", "status", "created_at");

-- CreateIndex
CREATE INDEX "message_attachments_message_id_idx" ON "message_attachments"("message_id");

-- CreateIndex
CREATE INDEX "application_assignments_application_id_unassigned_at_idx" ON "application_assignments"("application_id", "unassigned_at");

-- CreateIndex
CREATE INDEX "application_assignments_recruiter_account_id_unassigned_at__idx" ON "application_assignments"("recruiter_account_id", "unassigned_at", "application_id");

-- CreateIndex
CREATE INDEX "company_candidate_blocks_candidate_profile_id_revoked_at_idx" ON "company_candidate_blocks"("candidate_profile_id", "revoked_at");

-- CreateIndex
CREATE INDEX "company_candidate_blocks_company_id_candidate_profile_id_re_idx" ON "company_candidate_blocks"("company_id", "candidate_profile_id", "revoked_at");

-- CreateIndex
CREATE INDEX "talent_recommendation_runs_job_post_id_created_at_idx" ON "talent_recommendation_runs"("job_post_id", "created_at");

-- CreateIndex
CREATE INDEX "talent_recommendation_runs_company_id_created_at_idx" ON "talent_recommendation_runs"("company_id", "created_at");

-- CreateIndex
CREATE INDEX "talent_recommendations_job_post_id_generated_at_score_idx" ON "talent_recommendations"("job_post_id", "generated_at", "score");

-- CreateIndex
CREATE UNIQUE INDEX "talent_recommendations_run_id_candidate_profile_id_key" ON "talent_recommendations"("run_id", "candidate_profile_id");

-- CreateIndex
CREATE UNIQUE INDEX "talent_contact_requests_conversation_id_key" ON "talent_contact_requests"("conversation_id");

-- CreateIndex
CREATE UNIQUE INDEX "talent_contact_requests_current_attempt_id_key" ON "talent_contact_requests"("current_attempt_id");

-- CreateIndex
CREATE INDEX "talent_contact_requests_candidate_profile_id_status_created_idx" ON "talent_contact_requests"("candidate_profile_id", "status", "created_at");

-- CreateIndex
CREATE INDEX "talent_contact_requests_company_id_status_created_at_idx" ON "talent_contact_requests"("company_id", "status", "created_at");

-- CreateIndex
CREATE INDEX "talent_contact_requests_status_expires_at_idx" ON "talent_contact_requests"("status", "expires_at");

-- CreateIndex
CREATE UNIQUE INDEX "talent_contact_requests_company_id_candidate_profile_id_job_key" ON "talent_contact_requests"("company_id", "candidate_profile_id", "job_post_id");

-- CreateIndex
CREATE UNIQUE INDEX "talent_contact_attempts_intro_message_id_key" ON "talent_contact_attempts"("intro_message_id");

-- CreateIndex
CREATE UNIQUE INDEX "talent_contact_attempts_quota_usage_id_key" ON "talent_contact_attempts"("quota_usage_id");

-- CreateIndex
CREATE INDEX "talent_contact_attempts_request_id_sent_at_idx" ON "talent_contact_attempts"("request_id", "sent_at");

-- CreateIndex
CREATE UNIQUE INDEX "talent_contact_attempts_request_id_client_request_id_key" ON "talent_contact_attempts"("request_id", "client_request_id");

-- CreateIndex
CREATE UNIQUE INDEX "support_cases_case_number_key" ON "support_cases"("case_number");

-- CreateIndex
CREATE UNIQUE INDEX "support_cases_conversation_id_key" ON "support_cases"("conversation_id");

-- CreateIndex
CREATE INDEX "support_cases_department_status_assigned_admin_user_id_prio_idx" ON "support_cases"("department", "status", "assigned_admin_user_id", "priority", "updated_at", "id");

-- CreateIndex
CREATE INDEX "support_cases_created_by_recruiter_id_status_updated_at_idx" ON "support_cases"("created_by_recruiter_id", "status", "updated_at");

-- CreateIndex
CREATE INDEX "support_cases_company_id_status_updated_at_idx" ON "support_cases"("company_id", "status", "updated_at");

-- CreateIndex
CREATE INDEX "support_cases_job_post_id_idx" ON "support_cases"("job_post_id");

-- CreateIndex
CREATE INDEX "support_cases_invoice_id_idx" ON "support_cases"("invoice_id");

-- CreateIndex
CREATE INDEX "support_cases_company_subscription_id_idx" ON "support_cases"("company_subscription_id");

-- CreateIndex
CREATE UNIQUE INDEX "support_cases_company_id_created_by_recruiter_id_client_req_key" ON "support_cases"("company_id", "created_by_recruiter_id", "client_request_id");

-- CreateIndex
CREATE INDEX "support_case_assignment_histories_case_id_created_at_idx" ON "support_case_assignment_histories"("case_id", "created_at");

-- CreateIndex
CREATE INDEX "support_case_status_histories_case_id_created_at_idx" ON "support_case_status_histories"("case_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "subscription_usages_idempotency_key_key" ON "subscription_usages"("idempotency_key");

-- CreateIndex
CREATE UNIQUE INDEX "subscription_usages_reversed_usage_id_key" ON "subscription_usages"("reversed_usage_id");

-- CreateIndex
CREATE INDEX "subscription_usages_company_subscription_id_feature_created_idx" ON "subscription_usages"("company_subscription_id", "feature", "created_at");

-- CreateIndex
CREATE INDEX "subscription_usages_company_id_feature_created_at_idx" ON "subscription_usages"("company_id", "feature", "created_at");

-- CreateIndex
CREATE INDEX "subscription_usages_reference_type_reference_id_idx" ON "subscription_usages"("reference_type", "reference_id");

-- CreateIndex
CREATE UNIQUE INDEX "outbox_events_dedupe_key_key" ON "outbox_events"("dedupe_key");

-- CreateIndex
CREATE INDEX "outbox_events_status_next_attempt_at_created_at_idx" ON "outbox_events"("status", "next_attempt_at", "created_at");

-- CreateIndex
CREATE INDEX "outbox_events_aggregate_type_aggregate_id_idx" ON "outbox_events"("aggregate_type", "aggregate_id");

-- CreateIndex
CREATE UNIQUE INDEX "notifications_dedupe_key_key" ON "notifications"("dedupe_key");

-- AddForeignKey
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_application_id_fkey" FOREIGN KEY ("application_id") REFERENCES "applications"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_job_post_id_fkey" FOREIGN KEY ("job_post_id") REFERENCES "job_posts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_latest_message_id_fkey" FOREIGN KEY ("latest_message_id") REFERENCES "messages"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conversation_participants" ADD CONSTRAINT "conversation_participants_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "conversations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conversation_participants" ADD CONSTRAINT "conversation_participants_candidate_account_id_fkey" FOREIGN KEY ("candidate_account_id") REFERENCES "candidate_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conversation_participants" ADD CONSTRAINT "conversation_participants_recruiter_account_id_fkey" FOREIGN KEY ("recruiter_account_id") REFERENCES "recruiter_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conversation_participants" ADD CONSTRAINT "conversation_participants_admin_user_id_fkey" FOREIGN KEY ("admin_user_id") REFERENCES "admin"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conversation_participants" ADD CONSTRAINT "conversation_participants_last_read_message_id_fkey" FOREIGN KEY ("last_read_message_id") REFERENCES "messages"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "messages" ADD CONSTRAINT "messages_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "conversations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "messages" ADD CONSTRAINT "messages_sender_participant_id_fkey" FOREIGN KEY ("sender_participant_id") REFERENCES "conversation_participants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "messages" ADD CONSTRAINT "messages_reply_to_message_id_fkey" FOREIGN KEY ("reply_to_message_id") REFERENCES "messages"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "message_attachments" ADD CONSTRAINT "message_attachments_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "conversations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "message_attachments" ADD CONSTRAINT "message_attachments_file_asset_id_fkey" FOREIGN KEY ("file_asset_id") REFERENCES "files"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "message_attachments" ADD CONSTRAINT "message_attachments_uploaded_by_participant_id_fkey" FOREIGN KEY ("uploaded_by_participant_id") REFERENCES "conversation_participants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "message_attachments" ADD CONSTRAINT "message_attachments_message_id_fkey" FOREIGN KEY ("message_id") REFERENCES "messages"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "application_assignments" ADD CONSTRAINT "application_assignments_application_id_fkey" FOREIGN KEY ("application_id") REFERENCES "applications"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "application_assignments" ADD CONSTRAINT "application_assignments_recruiter_account_id_fkey" FOREIGN KEY ("recruiter_account_id") REFERENCES "recruiter_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "candidate_contact_preferences" ADD CONSTRAINT "candidate_contact_preferences_candidate_profile_id_fkey" FOREIGN KEY ("candidate_profile_id") REFERENCES "candidate_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "company_candidate_blocks" ADD CONSTRAINT "company_candidate_blocks_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "company_candidate_blocks" ADD CONSTRAINT "company_candidate_blocks_candidate_profile_id_fkey" FOREIGN KEY ("candidate_profile_id") REFERENCES "candidate_profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "talent_recommendation_runs" ADD CONSTRAINT "talent_recommendation_runs_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "talent_recommendation_runs" ADD CONSTRAINT "talent_recommendation_runs_job_post_id_fkey" FOREIGN KEY ("job_post_id") REFERENCES "job_posts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "talent_recommendation_runs" ADD CONSTRAINT "talent_recommendation_runs_requested_by_recruiter_id_fkey" FOREIGN KEY ("requested_by_recruiter_id") REFERENCES "recruiter_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "talent_recommendations" ADD CONSTRAINT "talent_recommendations_run_id_fkey" FOREIGN KEY ("run_id") REFERENCES "talent_recommendation_runs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "talent_recommendations" ADD CONSTRAINT "talent_recommendations_job_post_id_fkey" FOREIGN KEY ("job_post_id") REFERENCES "job_posts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "talent_recommendations" ADD CONSTRAINT "talent_recommendations_candidate_profile_id_fkey" FOREIGN KEY ("candidate_profile_id") REFERENCES "candidate_profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "talent_contact_requests" ADD CONSTRAINT "talent_contact_requests_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "talent_contact_requests" ADD CONSTRAINT "talent_contact_requests_candidate_profile_id_fkey" FOREIGN KEY ("candidate_profile_id") REFERENCES "candidate_profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "talent_contact_requests" ADD CONSTRAINT "talent_contact_requests_job_post_id_fkey" FOREIGN KEY ("job_post_id") REFERENCES "job_posts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "talent_contact_requests" ADD CONSTRAINT "talent_contact_requests_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "conversations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "talent_contact_requests" ADD CONSTRAINT "talent_contact_requests_current_attempt_id_fkey" FOREIGN KEY ("current_attempt_id") REFERENCES "talent_contact_attempts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "talent_contact_attempts" ADD CONSTRAINT "talent_contact_attempts_request_id_fkey" FOREIGN KEY ("request_id") REFERENCES "talent_contact_requests"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "talent_contact_attempts" ADD CONSTRAINT "talent_contact_attempts_sent_by_recruiter_id_fkey" FOREIGN KEY ("sent_by_recruiter_id") REFERENCES "recruiter_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "talent_contact_attempts" ADD CONSTRAINT "talent_contact_attempts_intro_message_id_fkey" FOREIGN KEY ("intro_message_id") REFERENCES "messages"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "talent_contact_attempts" ADD CONSTRAINT "talent_contact_attempts_quota_usage_id_fkey" FOREIGN KEY ("quota_usage_id") REFERENCES "subscription_usages"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "support_cases" ADD CONSTRAINT "support_cases_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "conversations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "support_cases" ADD CONSTRAINT "support_cases_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "support_cases" ADD CONSTRAINT "support_cases_created_by_recruiter_id_fkey" FOREIGN KEY ("created_by_recruiter_id") REFERENCES "recruiter_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "support_cases" ADD CONSTRAINT "support_cases_assigned_admin_user_id_fkey" FOREIGN KEY ("assigned_admin_user_id") REFERENCES "admin"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "support_cases" ADD CONSTRAINT "support_cases_job_post_id_fkey" FOREIGN KEY ("job_post_id") REFERENCES "job_posts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "support_cases" ADD CONSTRAINT "support_cases_invoice_id_fkey" FOREIGN KEY ("invoice_id") REFERENCES "invoices"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "support_cases" ADD CONSTRAINT "support_cases_company_subscription_id_fkey" FOREIGN KEY ("company_subscription_id") REFERENCES "company_subscriptions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "support_case_assignment_histories" ADD CONSTRAINT "support_case_assignment_histories_case_id_fkey" FOREIGN KEY ("case_id") REFERENCES "support_cases"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "support_case_assignment_histories" ADD CONSTRAINT "support_case_assignment_histories_from_admin_user_id_fkey" FOREIGN KEY ("from_admin_user_id") REFERENCES "admin"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "support_case_assignment_histories" ADD CONSTRAINT "support_case_assignment_histories_to_admin_user_id_fkey" FOREIGN KEY ("to_admin_user_id") REFERENCES "admin"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "support_case_status_histories" ADD CONSTRAINT "support_case_status_histories_case_id_fkey" FOREIGN KEY ("case_id") REFERENCES "support_cases"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subscription_usages" ADD CONSTRAINT "subscription_usages_company_subscription_id_fkey" FOREIGN KEY ("company_subscription_id") REFERENCES "company_subscriptions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subscription_usages" ADD CONSTRAINT "subscription_usages_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subscription_usages" ADD CONSTRAINT "subscription_usages_reversed_usage_id_fkey" FOREIGN KEY ("reversed_usage_id") REFERENCES "subscription_usages"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Constraints Prisma cannot express in the schema.
ALTER TABLE "conversation_participants"
ADD CONSTRAINT "conversation_participants_exactly_one_actor_check"
CHECK (num_nonnulls("candidate_account_id", "recruiter_account_id", "admin_user_id") = 1);

ALTER TABLE "conversation_participants"
ADD CONSTRAINT "conversation_participants_role_actor_check"
CHECK (
  ("role" = 'candidate' AND "candidate_account_id" IS NOT NULL) OR
  ("role" = 'recruiter' AND "recruiter_account_id" IS NOT NULL) OR
  ("role" IN ('admin', 'observer') AND "admin_user_id" IS NOT NULL)
);

ALTER TABLE "conversations"
ADD CONSTRAINT "conversations_type_context_check"
CHECK (
  ("type" = 'application_chat' AND "application_id" IS NOT NULL) OR
  ("type" <> 'application_chat' AND "application_id" IS NULL)
);

ALTER TABLE "company_subscriptions"
ADD CONSTRAINT "company_subscriptions_talent_contact_quota_check"
CHECK (
  "talent_contact_limit" >= 0 AND
  "talent_contact_used" >= 0 AND
  "talent_contact_used" <= "talent_contact_limit"
);

ALTER TABLE "subscription_usages"
ADD CONSTRAINT "subscription_usages_positive_quantity_check"
CHECK ("quantity" > 0);

ALTER TABLE "support_cases"
ADD CONSTRAINT "support_cases_assignment_state_check"
CHECK ("status" = 'new' OR "assigned_admin_user_id" IS NOT NULL);

CREATE UNIQUE INDEX "application_assignments_one_active_recruiter_key"
ON "application_assignments"("application_id", "recruiter_account_id")
WHERE "unassigned_at" IS NULL;

CREATE UNIQUE INDEX "company_candidate_blocks_one_active_key"
ON "company_candidate_blocks"("company_id", "candidate_profile_id")
WHERE "revoked_at" IS NULL;

CREATE UNIQUE INDEX "support_cases_one_active_job_review_key"
ON "support_cases"("job_post_id", "department")
WHERE "department" = 'job_review' AND "status" <> 'closed';
