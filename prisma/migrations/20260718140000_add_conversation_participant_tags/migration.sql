-- Personal conversation tags belong to one participant and are never shared
-- with the other participants in the same conversation.
ALTER TABLE "conversation_participants"
ADD COLUMN "tags" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];

CREATE INDEX "conversation_participants_tags_idx"
ON "conversation_participants" USING GIN ("tags");
