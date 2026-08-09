-- A structured offer lets candidates see terms and respond without using a
-- status transition to represent their decision.
CREATE TYPE "OfferResponse" AS ENUM ('pending', 'accepted', 'declined');

ALTER TABLE "applications"
  ADD COLUMN "offer_details" JSONB,
  ADD COLUMN "offer_deadline_at" TIMESTAMP(3),
  ADD COLUMN "offer_response" "OfferResponse",
  ADD COLUMN "offer_responded_at" TIMESTAMP(3);

CREATE INDEX "applications_offer_deadline_at_idx" ON "applications"("offer_deadline_at");
