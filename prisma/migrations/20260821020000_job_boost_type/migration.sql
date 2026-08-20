-- Hai nhãn UI khác nhau ("Nổi bật" vs "Tuyển gấp") cho tin được đẩy, dùng chung một
-- hạn mức `featured_job` -- `urgent_label` không có feature key riêng.
CREATE TYPE "JobBoostType" AS ENUM ('featured', 'urgent');

ALTER TABLE "job_boost" ADD COLUMN "type" "JobBoostType" NOT NULL DEFAULT 'featured';
