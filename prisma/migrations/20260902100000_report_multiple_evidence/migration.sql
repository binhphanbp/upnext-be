-- Một báo cáo gửi được nhiều ảnh bằng chứng. `reports.evidence_file_id` vẫn được giữ
-- (và vẫn được ghi bằng ảnh đầu tiên) để mọi chỗ đọc cột đó từ trước không vỡ; bảng này
-- là nguồn đầy đủ cho danh sách ảnh.
CREATE TABLE "report_evidences" (
    "id" UUID NOT NULL,
    "report_id" UUID NOT NULL,
    "file_id" UUID NOT NULL,
    "position" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "report_evidences_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "report_evidences_report_id_file_id_key"
    ON "report_evidences"("report_id", "file_id");

CREATE INDEX "report_evidences_report_id_position_idx"
    ON "report_evidences"("report_id", "position");

ALTER TABLE "report_evidences" ADD CONSTRAINT "report_evidences_report_id_fkey"
    FOREIGN KEY ("report_id") REFERENCES "reports"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "report_evidences" ADD CONSTRAINT "report_evidences_file_id_fkey"
    FOREIGN KEY ("file_id") REFERENCES "files"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Backfill: báo cáo cũ đọc qua bảng mới cũng ra đúng ảnh nó đang có.
INSERT INTO "report_evidences" ("id", "report_id", "file_id", "position", "created_at")
SELECT gen_random_uuid(), "id", "evidence_file_id", 0, "created_at"
FROM "reports"
WHERE "evidence_file_id" IS NOT NULL;
