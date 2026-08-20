-- Cache kết quả thao tác AI theo idempotency key, để retry của client không gọi lại model.
CREATE TABLE "ai_operation_results" (
    "id" UUID NOT NULL,
    "idempotency_key" VARCHAR(180) NOT NULL,
    "operation" VARCHAR(60) NOT NULL,
    "payload" JSONB NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ai_operation_results_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ai_operation_results_idempotency_key_key"
    ON "ai_operation_results"("idempotency_key");

-- Dọn hàng hết hạn được thực hiện kiểu cơ hội lúc ghi; index này là thứ làm việc đó rẻ.
CREATE INDEX "ai_operation_results_expires_at_idx"
    ON "ai_operation_results"("expires_at");
