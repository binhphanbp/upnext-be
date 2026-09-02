-- Các chip "Tìm kiếm phổ biến" đang nằm cứng ở 4 chỗ trong frontend: mảng
-- `fallbackPopularKeywords` (24 từ × 2 locale), mảng inline trong JSX của trang việc làm,
-- `keywordSuggestions`, và hai key chết trong messages/*.json. Bảng này gom về một nguồn.
--
-- Cố tình tách khỏi `search_keyword_logs`: bảng đó ĐO nhu cầu, bảng này ĐIỀU HƯỚNG.
-- Seed chip vào bảng log sẽ làm thống kê nhu cầu phản chiếu chính lựa chọn của mình.
CREATE TYPE "PopularSearchKeywordPlacement" AS ENUM ('home_hero', 'jobs_search');

CREATE TABLE "popular_search_keywords" (
    "id" UUID NOT NULL,
    "placement" "PopularSearchKeywordPlacement" NOT NULL,
    "locale" VARCHAR(5) NOT NULL,
    "label" VARCHAR(80) NOT NULL,
    "short_label" VARCHAR(40),
    "query" VARCHAR(120) NOT NULL,
    "priority" INTEGER NOT NULL,
    "category" VARCHAR(30),
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "popular_search_keywords_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "popular_search_keywords_placement_locale_query_key"
    ON "popular_search_keywords"("placement", "locale", "query");

CREATE INDEX "popular_search_keywords_placement_locale_is_active_priority_idx"
    ON "popular_search_keywords"("placement", "locale", "is_active", "priority");
