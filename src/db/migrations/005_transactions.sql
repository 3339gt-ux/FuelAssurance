-- Migration 005: Transactions, Invoice Transactions, Telematics Points, Refuelling Sessions, Invoice Periods
-- Depends on: 001, 002, 003, 004

-- ─── Invoice Periods ───────────────────────────────────────────────────────────

CREATE TABLE invoice_periods (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id          UUID NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
  provider        TEXT NOT NULL DEFAULT 'DKV',
  period_name     TEXT NOT NULL,
  period_start    DATE NOT NULL,
  period_end      DATE NOT NULL,
  status          TEXT NOT NULL DEFAULT 'open'
                    CHECK (status IN ('open','in_progress','review','signed_off','reopened')),
  signed_off_by   UUID REFERENCES users(id),
  signed_off_at   TIMESTAMPTZ,
  notes           TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE invoice_periods IS 'Defines reconciliation periods for grouping imports and producing sign-off reports.';

CREATE INDEX idx_invoice_periods_org ON invoice_periods(org_id);
CREATE INDEX idx_invoice_periods_dates ON invoice_periods(org_id, period_start, period_end);

-- ─── Transactions (from authorisation / transaction reports) ───────────────────

CREATE TABLE transactions (
  id                        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id                    UUID NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
  import_file_id            UUID NOT NULL REFERENCES import_files(id),
  source_row_number         INT NOT NULL,
  provider                  TEXT NOT NULL DEFAULT 'DKV',
  document_type             TEXT NOT NULL DEFAULT 'TRANSACTION',

  -- Vehicle/card identity
  licence_plate             TEXT,
  vehicle_id                UUID REFERENCES vehicles(id),
  card_raw                  TEXT,
  card_id                   UUID REFERENCES cards(id),
  equipment_number          TEXT,
  driver                    TEXT,

  -- Timing
  transaction_time          TIMESTAMPTZ,
  timestamp_precision       TEXT NOT NULL DEFAULT 'datetime',

  -- Authorisation
  authorisation_id          TEXT,
  response                  TEXT,
  is_approved               BOOLEAN NOT NULL DEFAULT true,

  -- Product
  product_code              TEXT,
  product_name              TEXT,
  product_group             TEXT,
  product_type              TEXT,
  cost_group                TEXT,

  -- Financial
  sales_value               NUMERIC,
  sales_unit                TEXT,
  authorisation_amount_gross NUMERIC,
  mileage                   NUMERIC,

  -- Location
  station_number            TEXT,
  station_name              TEXT,
  station_city              TEXT,
  station_category          TEXT,
  station_id                UUID REFERENCES stations(id),
  service_country           TEXT,

  -- DKV extras
  customer_id               TEXT,
  cost_centre               TEXT,
  card_addition             TEXT,

  -- Status
  status                    TEXT NOT NULL DEFAULT 'active',

  -- Raw data preservation
  raw_data                  JSONB,

  created_at                TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at                TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE transactions IS 'Normalised transaction/authorisation records from provider transaction reports (e.g. DKV Ola_Report).';

CREATE INDEX idx_transactions_org ON transactions(org_id);
CREATE INDEX idx_transactions_import ON transactions(import_file_id);
CREATE INDEX idx_transactions_vehicle ON transactions(org_id, licence_plate);
CREATE INDEX idx_transactions_time ON transactions(org_id, transaction_time);
CREATE INDEX idx_transactions_card ON transactions(org_id, card_raw);
CREATE INDEX idx_transactions_station ON transactions(org_id, station_number);
CREATE INDEX idx_transactions_auth_id ON transactions(org_id, authorisation_id);

-- ─── Invoice Transactions (from invoice / billing reports) ─────────────────────

CREATE TABLE invoice_transactions (
  id                                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id                            UUID NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
  import_file_id                    UUID NOT NULL REFERENCES import_files(id),
  invoice_period_id                 UUID REFERENCES invoice_periods(id),
  source_row_number                 INT NOT NULL,
  provider                          TEXT NOT NULL DEFAULT 'DKV',

  -- Timing
  transaction_time                  TIMESTAMPTZ,
  timestamp_precision               TEXT NOT NULL DEFAULT 'datetime',

  -- Vehicle/card identity
  licence_plate                     TEXT,
  vehicle_id                        UUID REFERENCES vehicles(id),
  card_raw                          TEXT,
  card_partner                      TEXT,
  card_id                           UUID REFERENCES cards(id),
  equipment_number                  TEXT,

  -- Location
  station_number                    TEXT,
  station_name                      TEXT,
  station_city                      TEXT,
  station_zip                       TEXT,
  station_id                        UUID REFERENCES stations(id),
  service_country                   TEXT,
  invoice_country                   TEXT,

  -- Transaction reference
  transaction_number                TEXT,

  -- Product
  cost_group                        TEXT,
  product_group                     TEXT,
  product_name                      TEXT,
  product_code                      TEXT,
  product_type                      TEXT,

  -- Financial (all NUMERIC for decimal-safe arithmetic)
  payment_currency                  TEXT,
  unit                              TEXT,
  quantity                          NUMERIC,
  price_per_unit                    NUMERIC,
  base_value_net                    NUMERIC,
  service_fee_net                   NUMERIC,
  value_of_purchase_net             NUMERIC,
  service_currency                  TEXT,
  value_in_pay_currency             NUMERIC,
  value_in_service_country_currency NUMERIC,
  vat                               NUMERIC,
  price_per_unit_gross              NUMERIC,
  discount_net                      NUMERIC,
  discount_gross                    NUMERIC,
  base_value_gross                  NUMERIC,

  -- Document references
  invoice_date                      DATE,
  document_number                   TEXT,
  invoice_number                    TEXT,
  ticket_number                     TEXT,

  -- Cost centres
  cost_centre_1                     TEXT,
  cost_centre_2                     TEXT,

  -- Extras
  mileage                           NUMERIC,
  ages_terminal                     TEXT,
  customer_id                       TEXT,

  -- Status
  status                            TEXT NOT NULL DEFAULT 'active',

  -- Raw data preservation
  raw_data                          JSONB,

  created_at                        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at                        TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE invoice_transactions IS 'Normalised invoice transaction rows from provider billing reports (e.g. DKV Invoice-Transactions_Report).';

CREATE INDEX idx_inv_tx_org ON invoice_transactions(org_id);
CREATE INDEX idx_inv_tx_import ON invoice_transactions(import_file_id);
CREATE INDEX idx_inv_tx_period ON invoice_transactions(invoice_period_id);
CREATE INDEX idx_inv_tx_vehicle ON invoice_transactions(org_id, licence_plate);
CREATE INDEX idx_inv_tx_time ON invoice_transactions(org_id, transaction_time);
CREATE INDEX idx_inv_tx_card ON invoice_transactions(org_id, card_raw);
CREATE INDEX idx_inv_tx_station ON invoice_transactions(org_id, station_number);
CREATE INDEX idx_inv_tx_invoice ON invoice_transactions(org_id, invoice_number);
CREATE INDEX idx_inv_tx_equipment ON invoice_transactions(org_id, equipment_number);

-- ─── Telematics Points ─────────────────────────────────────────────────────────

CREATE TABLE telematics_points (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id              UUID NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
  import_file_id      UUID NOT NULL REFERENCES import_files(id),
  source_row_number   INT NOT NULL,

  -- Vehicle
  vehicle_raw         TEXT,
  vehicle_id          UUID REFERENCES vehicles(id),
  trailer_raw         TEXT,
  trailer_id          UUID REFERENCES trailers(id),

  -- Timing
  created_date        TIMESTAMPTZ,
  timestamp_precision TEXT NOT NULL DEFAULT 'datetime',
  source_timezone     TEXT,

  -- Telemetry
  data_source         TEXT,
  fuel_level          NUMERIC,
  km                  NUMERIC,
  speed               NUMERIC,

  -- Driver
  driver_raw          TEXT,
  driver_id           UUID REFERENCES drivers(id),

  -- Activity
  activity            TEXT,
  info                TEXT,

  -- Location (text-based — no fabricated coordinates)
  position_city       TEXT,
  position_town       TEXT,
  position_street     TEXT,
  position_village    TEXT,
  position_address    TEXT,

  -- Coordinates (only when genuinely provided)
  latitude            NUMERIC,
  longitude           NUMERIC,

  -- Raw data preservation
  raw_data            JSONB,

  created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE telematics_points IS 'GPS/telematics data points. May have text-only locations or real coordinates depending on the source.';

CREATE INDEX idx_telem_org ON telematics_points(org_id);
CREATE INDEX idx_telem_import ON telematics_points(import_file_id);
CREATE INDEX idx_telem_vehicle ON telematics_points(org_id, vehicle_raw);
CREATE INDEX idx_telem_vehicle_id ON telematics_points(org_id, vehicle_id);
CREATE INDEX idx_telem_time ON telematics_points(org_id, created_date);

-- ─── Refuelling Sessions ───────────────────────────────────────────────────────

CREATE TABLE refuelling_sessions (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id                UUID NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
  vehicle_id            UUID REFERENCES vehicles(id),
  station_id            UUID REFERENCES stations(id),
  session_start         TIMESTAMPTZ,
  session_end           TIMESTAMPTZ,
  total_diesel_litres   NUMERIC,
  total_adblue_litres   NUMERIC,
  fuel_level_before     NUMERIC,
  fuel_level_after      NUMERIC,
  odometer_start        NUMERIC,
  odometer_end          NUMERIC,
  transaction_ids       UUID[],
  telematics_point_ids  UUID[],
  evidence              JSONB,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE refuelling_sessions IS 'Detected refuelling sessions grouping nearby telematics points and fuel transactions at a single stop.';

CREATE INDEX idx_sessions_org ON refuelling_sessions(org_id);
CREATE INDEX idx_sessions_vehicle ON refuelling_sessions(org_id, vehicle_id);
CREATE INDEX idx_sessions_time ON refuelling_sessions(org_id, session_start);
