-- Ngữ cảnh trang của Copilot có thể là slug tin tuyển dụng (route công khai là
-- /jobs/[slug]), không chỉ UUID. Cột kiểu uuid từ chối slug ở tầng DB và làm mọi
-- hội thoại mở từ trang tin trả 500.
ALTER TABLE "ai_conversations"
  ALTER COLUMN "context_id" TYPE VARCHAR(220) USING "context_id"::text;
