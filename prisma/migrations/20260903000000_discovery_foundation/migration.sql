-- Business-level audit trail for every actor type.
--
-- `admin_audit_logs.admin_id` is FK-constrained to `admin_users`, so it cannot
-- record a recruiter or candidate action. This table deliberately carries NO
-- foreign keys on `actor_id` / `company_id` / `candidate_profile_id`: an audit
-- row must outlive the row it describes, and must never be blocked by an
-- `ON DELETE RESTRICT` on the action it is only recording.
CREATE TABLE "domain_audit_events" (
  "id"                   UUID         NOT NULL,
  "event_type"           VARCHAR(80)  NOT NULL,
  "aggregate_type"       VARCHAR(60)  NOT NULL,
  "aggregate_id"         UUID         NOT NULL,
  "actor_type"           "ActorType",
  "actor_id"             UUID,
  "company_id"           UUID,
  "candidate_profile_id" UUID,
  "metadata"             JSONB,
  "created_at"           TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "domain_audit_events_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "domain_audit_events_aggregate_type_aggregate_id_created_at_idx"
  ON "domain_audit_events"("aggregate_type", "aggregate_id", "created_at");

CREATE INDEX "domain_audit_events_company_id_event_type_created_at_idx"
  ON "domain_audit_events"("company_id", "event_type", "created_at");

-- Tên đặt tường minh: tên theo quy ước sẽ dài 66 ký tự và bị Postgres cắt
-- ở giới hạn 63 byte, khiến tên trong DB khác tên trong migration.
CREATE INDEX "domain_audit_events_candidate_event_created_idx"
  ON "domain_audit_events"("candidate_profile_id", "event_type", "created_at");

CREATE INDEX "domain_audit_events_event_type_created_at_idx"
  ON "domain_audit_events"("event_type", "created_at");
