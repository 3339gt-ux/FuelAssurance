-- Migration 006: Reconciliation Engine Tables
-- Depends on: 001-005

-- ─── Reconciliation Runs ───────────────────────────────────────────────────────

CREATE TABLE reconciliation_runs (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id                  UUID NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
  invoice_period_id       UUID REFERENCES invoice_periods(id),
  run_date                TIMESTAMPTZ NOT NULL DEFAULT now(),
  run_by                  UUID NOT NULL REFERENCES users(id),

  -- Source files
  transaction_file_ids    UUID[] NOT NULL DEFAULT '{}',
  invoice_file_ids        UUID[] NOT NULL DEFAULT '{}',

  -- Period alignment
  period_alignment        TEXT,
  period_alignment_details JSONB,

  -- Configuration snapshot
  config                  JSONB NOT NULL DEFAULT '{}',
  rule_set_version        TEXT,

  -- Statistics
  total_transactions      INT NOT NULL DEFAULT 0,
  total_invoice_rows      INT NOT NULL DEFAULT 0,
  matched                 INT NOT NULL DEFAULT 0,
  unmatched_transactions  INT NOT NULL DEFAULT 0,
  unmatched_invoice_rows  INT NOT NULL DEFAULT 0,
  warnings                INT NOT NULL DEFAULT 0,

  -- Status
  status                  TEXT NOT NULL DEFAULT 'running'
                            CHECK (status IN ('running','completed','failed','cancelled')),

  created_at              TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE reconciliation_runs IS 'Each reconciliation execution with its configuration snapshot, source files, and aggregate results.';

CREATE INDEX idx_recon_runs_org ON reconciliation_runs(org_id);
CREATE INDEX idx_recon_runs_period ON reconciliation_runs(invoice_period_id);

-- ─── Reconciliation Candidates ─────────────────────────────────────────────────

CREATE TABLE reconciliation_candidates (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id                  UUID NOT NULL REFERENCES reconciliation_runs(id) ON DELETE CASCADE,
  transaction_id          UUID REFERENCES transactions(id),
  invoice_transaction_id  UUID REFERENCES invoice_transactions(id),
  match_stage             INT NOT NULL,
  score                   NUMERIC NOT NULL DEFAULT 0,
  evidence                JSONB,
  rejected                BOOLEAN NOT NULL DEFAULT false,
  rejection_reason        TEXT,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE reconciliation_candidates IS 'Candidate matches considered during reconciliation, including rejected candidates for audit trail.';

CREATE INDEX idx_recon_cand_run ON reconciliation_candidates(run_id);
CREATE INDEX idx_recon_cand_tx ON reconciliation_candidates(transaction_id);
CREATE INDEX idx_recon_cand_inv ON reconciliation_candidates(invoice_transaction_id);

-- ─── Reconciliation Matches ────────────────────────────────────────────────────

CREATE TABLE reconciliation_matches (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id                  UUID NOT NULL REFERENCES reconciliation_runs(id) ON DELETE CASCADE,
  transaction_id          UUID REFERENCES transactions(id),
  invoice_transaction_id  UUID REFERENCES invoice_transactions(id),

  -- Match result
  match_status            TEXT NOT NULL,
  match_confidence        NUMERIC,
  match_stage             INT,

  -- Variances
  quantity_difference     NUMERIC,
  financial_variance      JSONB,
  time_difference_seconds INT,

  -- Explanation
  reason_codes            TEXT[] NOT NULL DEFAULT '{}',
  explanation             TEXT,
  evidence                JSONB,
  missing_evidence        TEXT[] DEFAULT '{}',
  data_quality_warnings   TEXT[] DEFAULT '{}',

  -- Review
  review_status           TEXT NOT NULL DEFAULT 'pending'
                            CHECK (review_status IN ('pending','reviewed','accepted','rejected','escalated')),

  created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE reconciliation_matches IS 'Final reconciliation results linking transactions to invoice rows with status, evidence, and review state.';

CREATE INDEX idx_recon_match_run ON reconciliation_matches(run_id);
CREATE INDEX idx_recon_match_tx ON reconciliation_matches(transaction_id);
CREATE INDEX idx_recon_match_inv ON reconciliation_matches(invoice_transaction_id);
CREATE INDEX idx_recon_match_status ON reconciliation_matches(run_id, match_status);
CREATE INDEX idx_recon_match_review ON reconciliation_matches(run_id, review_status);

-- ─── Financial Assessments ─────────────────────────────────────────────────────

CREATE TABLE financial_assessments (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reconciliation_match_id UUID NOT NULL REFERENCES reconciliation_matches(id) ON DELETE CASCADE,
  field_name              TEXT NOT NULL,
  source_value            NUMERIC,
  expected_value          NUMERIC,
  difference              NUMERIC,
  tolerance               NUMERIC,
  formula                 TEXT,
  reason_code             TEXT,
  explanation             TEXT,
  within_tolerance        BOOLEAN NOT NULL DEFAULT true,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE financial_assessments IS 'Per-field financial validation results for each reconciliation match.';

CREATE INDEX idx_fin_assess_match ON financial_assessments(reconciliation_match_id);

-- ─── Telematics Assessments ────────────────────────────────────────────────────

CREATE TABLE telematics_assessments (
  id                        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id                    UUID NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
  transaction_id            UUID REFERENCES transactions(id),
  invoice_transaction_id    UUID REFERENCES invoice_transactions(id),
  reconciliation_match_id   UUID REFERENCES reconciliation_matches(id),
  vehicle_id                UUID REFERENCES vehicles(id),
  station_id                UUID REFERENCES stations(id),
  session_id                UUID REFERENCES refuelling_sessions(id),

  -- Confidence dimensions
  extraction_confidence     NUMERIC,
  match_confidence          NUMERIC,
  telematics_confidence     NUMERIC,
  data_quality_confidence   NUMERIC,

  -- Overall
  overall_classification    TEXT NOT NULL,
  overall_score             NUMERIC NOT NULL DEFAULT 0,

  -- Factor breakdown
  factor_scores             JSONB NOT NULL DEFAULT '{}',

  -- Evidence
  supporting_evidence       JSONB,
  contradictory_evidence    JSONB,
  missing_evidence          JSONB,
  data_quality_warnings     TEXT[] DEFAULT '{}',
  alternative_explanations  TEXT[] DEFAULT '{}',

  -- Rule version
  rule_set_version          TEXT,
  config_snapshot           JSONB,

  created_at                TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at                TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE telematics_assessments IS 'Telematics verification results with multi-dimensional confidence scoring and factor breakdown.';

CREATE INDEX idx_telem_assess_org ON telematics_assessments(org_id);
CREATE INDEX idx_telem_assess_tx ON telematics_assessments(transaction_id);
CREATE INDEX idx_telem_assess_class ON telematics_assessments(org_id, overall_classification);

-- ─── Reasoning Ledgers ─────────────────────────────────────────────────────────

CREATE TABLE reasoning_ledgers (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id                  UUID NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
  entity_type             TEXT NOT NULL,
  entity_id               UUID NOT NULL,
  assessment_type         TEXT NOT NULL,

  -- Versioning
  rule_set_version        TEXT,
  parser_version          TEXT,
  mapping_version         TEXT,

  -- Inputs
  raw_inputs              JSONB,
  normalised_inputs       JSONB,

  -- Matching
  candidates_considered   JSONB,
  candidates_rejected     JSONB,

  -- Factors
  factors                 JSONB NOT NULL DEFAULT '[]',

  -- Evidence
  supporting_evidence     JSONB,
  contradictory_evidence  JSONB,
  missing_evidence        JSONB,
  data_quality_warnings   TEXT[] DEFAULT '{}',
  timezone_conversions    JSONB,
  tolerances              JSONB,
  alternative_explanations TEXT[] DEFAULT '{}',

  -- Result
  final_classification    TEXT,
  final_score             NUMERIC,
  recommended_action      TEXT,

  -- Machine vs human
  machine_result          JSONB,
  user_decision           JSONB,

  created_at              TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE reasoning_ledgers IS 'Permanent audit trail of every factor, evidence item, and decision for reproducible assessments.';

CREATE INDEX idx_reason_org ON reasoning_ledgers(org_id);
CREATE INDEX idx_reason_entity ON reasoning_ledgers(entity_type, entity_id);
