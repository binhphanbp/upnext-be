-- AlterEnum
ALTER TYPE "FilePurpose" ADD VALUE IF NOT EXISTS 'post_content';
ALTER TYPE "FilePurpose" ADD VALUE IF NOT EXISTS 'post_social';

-- AlterTable
ALTER TABLE "posts"
  ADD COLUMN "excerpt" VARCHAR(500),
  ADD COLUMN "focus_keyword" VARCHAR(120),
  ADD COLUMN "canonical_url" VARCHAR(500),
  ADD COLUMN "is_indexable" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "is_followable" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "thumbnail_alt" VARCHAR(255),
  ADD COLUMN "cover_image_alt" VARCHAR(255),
  ADD COLUMN "social_image_file_id" UUID,
  ADD COLUMN "social_image_alt" VARCHAR(255),
  ADD COLUMN "social_title" VARCHAR(255),
  ADD COLUMN "social_description" VARCHAR(500),
  ADD COLUMN "published_at" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "post_slug_history" (
  "id" UUID NOT NULL,
  "post_id" UUID NOT NULL,
  "slug" VARCHAR(200) NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "post_slug_history_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "post_slug_history_slug_key" ON "post_slug_history"("slug");
CREATE INDEX "post_slug_history_post_id_idx" ON "post_slug_history"("post_id");

-- AddForeignKey
ALTER TABLE "posts" ADD CONSTRAINT "posts_social_image_file_id_fkey" FOREIGN KEY ("social_image_file_id") REFERENCES "files"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "post_slug_history" ADD CONSTRAINT "post_slug_history_post_id_fkey" FOREIGN KEY ("post_id") REFERENCES "posts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Backfill publication timestamp for existing published posts.
UPDATE "posts"
SET "published_at" = "created_at"
WHERE "status" = 'published' AND "published_at" IS NULL;
