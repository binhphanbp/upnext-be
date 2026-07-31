-- Store a normalized province/city preference separately from the candidate's free-form address.
ALTER TABLE "candidate_profiles"
ADD COLUMN "preferred_search_city" VARCHAR(100);
