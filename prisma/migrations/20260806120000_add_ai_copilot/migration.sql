-- AI Copilot: hội thoại, tin nhắn, phản hồi, hành động cần xác nhận, và sổ ghi AI run.
-- Xem ADR-001 (kiến trúc AI trong NestJS) và KE-HOACH-AI-REVIEW.md §6.2.

-- CreateEnum
CREATE TYPE "AiConversationContext" AS ENUM ('general', 'cv', 'job', 'application', 'mock_interview');

-- CreateEnum
CREATE TYPE "AiMessageRole" AS ENUM ('user', 'assistant');

-- CreateEnum
CREATE TYPE "AiRunStatus" AS ENUM ('pending', 'streaming', 'completed', 'partial', 'failed');

-- CreateEnum
CREATE TYPE "AiFeedbackRating" AS ENUM ('up', 'down');

-- CreateEnum
CREATE TYPE "AiActionType" AS ENUM ('apply_cv_suggestion', 'save_job', 'update_job_preference');

-- CreateEnum
CREATE TYPE "AiActionStatus" AS ENUM ('pending', 'confirmed', 'rejected', 'expired', 'executed', 'failed');

-- CreateTable
CREATE TABLE "ai_conversations" (
    "id" UUID NOT NULL,
    "actor_type" "ActorType" NOT NULL,
    "candidate_profile_id" UUID,
    "context_type" "AiConversationContext" NOT NULL DEFAULT 'general',
    "context_id" UUID,
    "locale" VARCHAR(5) NOT NULL DEFAULT 'vi',
    "title" VARCHAR(180) NOT NULL DEFAULT '',
    "is_archived" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ai_conversations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_messages" (
    "id" UUID NOT NULL,
    "conversation_id" UUID NOT NULL,
    "role" "AiMessageRole" NOT NULL,
    "content" TEXT NOT NULL DEFAULT '',
    "status" "AiRunStatus" NOT NULL DEFAULT 'pending',
    "intent" VARCHAR(40),
    "citations_json" JSONB,
    "cards_json" JSONB,
    "tool_calls_json" JSONB,
    "suggestions_json" JSONB,
    "model_name" VARCHAR(80),
    "prompt_version" VARCHAR(60),
    "input_tokens" INTEGER,
    "output_tokens" INTEGER,
    "latency_ms" INTEGER,
    "error_code" VARCHAR(60),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ai_messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_message_feedbacks" (
    "id" UUID NOT NULL,
    "message_id" UUID NOT NULL,
    "actor_type" "ActorType" NOT NULL,
    "actor_id" UUID NOT NULL,
    "rating" "AiFeedbackRating" NOT NULL,
    "reason_code" VARCHAR(60),
    "comment" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ai_message_feedbacks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_action_requests" (
    "id" UUID NOT NULL,
    "conversation_id" UUID NOT NULL,
    "message_id" UUID,
    "actor_type" "ActorType" NOT NULL,
    "actor_id" UUID NOT NULL,
    "action_type" "AiActionType" NOT NULL,
    "payload_json" JSONB NOT NULL,
    "status" "AiActionStatus" NOT NULL DEFAULT 'pending',
    "expires_at" TIMESTAMP(3) NOT NULL,
    "confirmed_at" TIMESTAMP(3),
    "executed_at" TIMESTAMP(3),
    "failure_reason" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ai_action_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_runs" (
    "id" UUID NOT NULL,
    "trace_id" VARCHAR(60) NOT NULL,
    "actor_type" "ActorType" NOT NULL,
    "actor_id" UUID,
    "feature" VARCHAR(60) NOT NULL,
    "intent" VARCHAR(40),
    "model_name" VARCHAR(80) NOT NULL,
    "prompt_version" VARCHAR(60) NOT NULL,
    "input_tokens" INTEGER NOT NULL DEFAULT 0,
    "output_tokens" INTEGER NOT NULL DEFAULT 0,
    "latency_ms" INTEGER NOT NULL DEFAULT 0,
    "tool_call_count" INTEGER NOT NULL DEFAULT 0,
    "status" "AiRunStatus" NOT NULL DEFAULT 'pending',
    "error_code" VARCHAR(60),
    "blocked_tool_count" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ai_runs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ai_conversations_candidate_profile_id_is_archived_updated_at_idx"
    ON "ai_conversations"("candidate_profile_id", "is_archived", "updated_at");

-- CreateIndex
CREATE INDEX "ai_messages_conversation_id_created_at_idx"
    ON "ai_messages"("conversation_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "ai_message_feedbacks_message_id_key" ON "ai_message_feedbacks"("message_id");

-- CreateIndex
CREATE UNIQUE INDEX "ai_action_requests_message_id_key" ON "ai_action_requests"("message_id");

-- CreateIndex
CREATE INDEX "ai_action_requests_actor_id_status_idx" ON "ai_action_requests"("actor_id", "status");

-- CreateIndex
CREATE INDEX "ai_runs_feature_created_at_idx" ON "ai_runs"("feature", "created_at");

-- CreateIndex
CREATE INDEX "ai_runs_actor_id_created_at_idx" ON "ai_runs"("actor_id", "created_at");

-- AddForeignKey
ALTER TABLE "ai_conversations" ADD CONSTRAINT "ai_conversations_candidate_profile_id_fkey"
    FOREIGN KEY ("candidate_profile_id") REFERENCES "candidate_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_messages" ADD CONSTRAINT "ai_messages_conversation_id_fkey"
    FOREIGN KEY ("conversation_id") REFERENCES "ai_conversations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_message_feedbacks" ADD CONSTRAINT "ai_message_feedbacks_message_id_fkey"
    FOREIGN KEY ("message_id") REFERENCES "ai_messages"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_action_requests" ADD CONSTRAINT "ai_action_requests_conversation_id_fkey"
    FOREIGN KEY ("conversation_id") REFERENCES "ai_conversations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_action_requests" ADD CONSTRAINT "ai_action_requests_message_id_fkey"
    FOREIGN KEY ("message_id") REFERENCES "ai_messages"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Một hội thoại của candidate phải có candidate_profile_id; các actor khác chưa hỗ trợ.
-- Ràng buộc này chặn hội thoại mồ côi ngay ở tầng DB thay vì tin vào tầng ứng dụng.
ALTER TABLE "ai_conversations" ADD CONSTRAINT "ai_conversations_owner_matches_actor"
    CHECK (
      (actor_type = 'candidate' AND candidate_profile_id IS NOT NULL)
      OR (actor_type <> 'candidate' AND candidate_profile_id IS NULL)
    );

-- Token và độ trễ không thể âm. Lưới an toàn cho lỗi ghi log.
ALTER TABLE "ai_runs" ADD CONSTRAINT "ai_runs_non_negative_metrics"
    CHECK (input_tokens >= 0 AND output_tokens >= 0 AND latency_ms >= 0
           AND tool_call_count >= 0 AND blocked_tool_count >= 0);
