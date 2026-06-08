-- Migration 007: Reviews, Reports, and Audit
-- Depends on: 001-006

-- ─── Review Decisions ──────────────────────────────────────────────────────────

CREATE TABLE review_decisions (
  id                        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id                    UUID NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
  entity_type               TEXT NOT NULL,
  entity_id                 UUID NOT NULL,
  reconciliation_match_id   UUID REFERENCES reconciliation_matches(id),
  telematics_assessment_id  UUID REFERENCES telematics_assessments(id),

  decision                  TEXT NOT NULL
                              CHECK (decision IN ('accept','reject','relink','expected_variance','investigate','exclude')),
  reason                    TEXT NOT NULL,
  notes                     TEXT,

  decided_by                UUID NOT NULL REFERENCES users(id),
  decided_at                TIMESTAMPTZ NOT NULL DEFAULT now(),

  previous_status           TEXT,
  new_status                TEXT,

  created_at                TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE review_decisions IS 'Every human review decision with reason, preserving the audit trail of who decided what and when.';

CREATE INDEX idx_review_org ON review_decisions(org_id);
CREATE INDEX idx_review_entity ON review_decisions(entity_type, entity_id);
CREATE INDEX idx_review_match ON review_decisions(reconciliation_match_id);
CREATE INDEX idx_review_user ON review_decisions(decided_by);

-- ─── Report Definitions ────────────────────────────────────────────────────────

CREATE TABLE report_definitions (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id            UUID NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
  report_name       TEXT NOT NULL,
  report_type       TEXT NOT NULL,
  filters           JSONB NOT NULL DEFAULT '{}',
  columns           JSONB NOT NULL DEFAULT '[]',
  format            TEXT NOT NULL DEFAULT 'XLSX',
  created_by        UUID NOT NULL REFERENCES users(id),
  is_default        BOOLEAN NOT NULL DEFAULT false,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE report_definitions IS 'Saved report configurations including filters, columns, and format preferences per user.';

CREATE INDEX idx_report_def_org ON report_definitions(org_id);
CREATE INDEX idx_report_def_user ON report_definitions(created_by);

-- ─── Report Runs ───────────────────────────────────────────────────────────────

CREATE TABLE report_runs (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id                UUID NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
  report_definition_id  UUID NOT NULL REFERENCES report_definitions(id),
  run_by                UUID NOT NULL REFERENCES users(id),
  run_date              TIMESTAMPTZ NOT NULL DEFAULT now(),
  parameters            JSONB,
  row_count             INT,
  file_path             TEXT,
  file_format           TEXT,
  status                TEXT NOT NULL DEFAULT 'running'
                          CHECK (status IN ('running','completed','failed')),
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE report_runs IS 'Each report generation execution with output location and status.';

CREATE INDEX idx_report_runs_org ON report_runs(org_id);
CREATE INDEX idx_report_runs_def ON report_runs(report_definition_id);

-- ─── Audit Events ──────────────────────────────────────────────────────────────

CREATE TABLE audit_events (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id                UUID NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
  user_id               UUID NOT NULL REFERENCES users(id),
  event_date            TIMESTAMPTZ NOT NULL DEFAULT now(),

  action                TEXT NOT NULL,
  entity_type           TEXT,
  entity_id             UUID,

  previous_value        JSONB,
  new_value             JSONB,

  reason                TEXT,
  source                TEXT,

  related_entity_type   TEXT,
  related_entity_id     UUID,

  ip_address            INET,
  user_agent            TEXT,

  created_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE audit_events IS 'Immutable audit log of every significant action in the system.';

-- Audit should be append-only — no UPDATE or DELETE
-- This is enforced by RLS policies in migration 008

CREATE INDEX idx_audit_org_date ON audit_events(org_id, event_date DESC);
CREATE INDEX idx_audit_entity ON audit_events(org_id, entity_type, entity_id);
CREATE INDEX idx_audit_action ON audit_events(org_id, action);
CREATE INDEX idx_audit_user ON audit_events(org_id, user_id);
