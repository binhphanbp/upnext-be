-- Keep a colleague explicitly invited to a single chat when a separate
-- application assignment is later removed.
ALTER TABLE "conversation_participants"
ADD COLUMN "explicitly_added" BOOLEAN NOT NULL DEFAULT false;
