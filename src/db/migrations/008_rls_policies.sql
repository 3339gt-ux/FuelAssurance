-- Migration 008: Row-Level Security Policies
-- Depends on: 001-007
-- Ensures all operational data is organisation-scoped.

-- ─── Helper Function ───────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION get_user_org_ids()
RETURNS SETOF UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT org_id FROM memberships WHERE user_id = auth.uid();
$$;

COMMENT ON FUNCTION get_user_org_ids IS 'Returns all organisation IDs the current authenticated user belongs to.';

-- ─── Enable RLS on ALL tables ──────────────────────────────────────────────────

ALTER TABLE organisations ENABLE ROW LEVEL SECURITY;
ALTER TABLE memberships ENABLE ROW LEVEL SECURITY;
ALTER TABLE import_files ENABLE ROW LEVEL SECURITY;
ALTER TABLE import_pages ENABLE ROW LEVEL SECURITY;
ALTER TABLE import_rows ENABLE ROW LEVEL SECURITY;
ALTER TABLE import_fields ENABLE ROW LEVEL SECURITY;
ALTER TABLE import_mappings ENABLE ROW LEVEL SECURITY;
ALTER TABLE parser_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE vehicles ENABLE ROW LEVEL SECURITY;
ALTER TABLE vehicle_aliases ENABLE ROW LEVEL SECURITY;
ALTER TABLE vehicle_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE vehicle_tank_configurations ENABLE ROW LEVEL SECURITY;
ALTER TABLE cards ENABLE ROW LEVEL SECURITY;
ALTER TABLE card_aliases ENABLE ROW LEVEL SECURITY;
ALTER TABLE card_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE drivers ENABLE ROW LEVEL SECURITY;
ALTER TABLE driver_aliases ENABLE ROW LEVEL SECURITY;
ALTER TABLE trailers ENABLE ROW LEVEL SECURITY;
ALTER TABLE telematics_devices ENABLE ROW LEVEL SECURITY;
ALTER TABLE obus ENABLE ROW LEVEL SECURITY;
ALTER TABLE stations ENABLE ROW LEVEL SECURITY;
ALTER TABLE station_aliases ENABLE ROW LEVEL SECURITY;
ALTER TABLE station_prices ENABLE ROW LEVEL SECURITY;
ALTER TABLE station_discount_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE products ENABLE ROW LEVEL SECURITY;
ALTER TABLE product_aliases ENABLE ROW LEVEL SECURITY;
ALTER TABLE invoice_periods ENABLE ROW LEVEL SECURITY;
ALTER TABLE transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE invoice_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE telematics_points ENABLE ROW LEVEL SECURITY;
ALTER TABLE refuelling_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE reconciliation_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE reconciliation_candidates ENABLE ROW LEVEL SECURITY;
ALTER TABLE reconciliation_matches ENABLE ROW LEVEL SECURITY;
ALTER TABLE financial_assessments ENABLE ROW LEVEL SECURITY;
ALTER TABLE telematics_assessments ENABLE ROW LEVEL SECURITY;
ALTER TABLE reasoning_ledgers ENABLE ROW LEVEL SECURITY;
ALTER TABLE review_decisions ENABLE ROW LEVEL SECURITY;
ALTER TABLE report_definitions ENABLE ROW LEVEL SECURITY;
ALTER TABLE report_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_events ENABLE ROW LEVEL SECURITY;

-- ─── Macro for org-scoped tables ───────────────────────────────────────────────
-- Each org-scoped table gets SELECT/INSERT/UPDATE/DELETE policies

-- Organisations: users can see orgs they belong to
CREATE POLICY "Users can view their organisations"
  ON organisations FOR SELECT
  USING (id IN (SELECT get_user_org_ids()));

-- Memberships: users can see their own memberships
CREATE POLICY "Users can view their memberships"
  ON memberships FOR SELECT
  USING (user_id = auth.uid());

-- ─── Generic org-scoped policies (applied to all data tables) ──────────────────

DO $$
DECLARE
  tbl TEXT;
BEGIN
  FOR tbl IN
    SELECT unnest(ARRAY[
      'import_files', 'import_mappings',
      'vehicles', 'cards', 'drivers', 'trailers', 'telematics_devices', 'obus',
      'stations', 'products',
      'invoice_periods', 'transactions', 'invoice_transactions',
      'telematics_points', 'refuelling_sessions',
      'reconciliation_runs', 'telematics_assessments', 'reasoning_ledgers',
      'review_decisions', 'report_definitions', 'report_runs', 'audit_events'
    ])
  LOOP
    EXECUTE format(
      'CREATE POLICY "Org isolation select on %1$s" ON %1$s FOR SELECT USING (org_id IN (SELECT get_user_org_ids()))',
      tbl
    );
    EXECUTE format(
      'CREATE POLICY "Org isolation insert on %1$s" ON %1$s FOR INSERT WITH CHECK (org_id IN (SELECT get_user_org_ids()))',
      tbl
    );
    EXECUTE format(
      'CREATE POLICY "Org isolation update on %1$s" ON %1$s FOR UPDATE USING (org_id IN (SELECT get_user_org_ids()))',
      tbl
    );
    -- Audit events are append-only — no DELETE
    IF tbl != 'audit_events' THEN
      EXECUTE format(
        'CREATE POLICY "Org isolation delete on %1$s" ON %1$s FOR DELETE USING (org_id IN (SELECT get_user_org_ids()))',
        tbl
      );
    END IF;
  END LOOP;
END $$;

-- ─── Child tables (scoped through parent FK) ──────────────────────────────────

-- import_pages — through import_files
CREATE POLICY "Org isolation on import_pages" ON import_pages FOR SELECT
  USING (import_file_id IN (SELECT id FROM import_files WHERE org_id IN (SELECT get_user_org_ids())));
CREATE POLICY "Org isolation insert import_pages" ON import_pages FOR INSERT
  WITH CHECK (import_file_id IN (SELECT id FROM import_files WHERE org_id IN (SELECT get_user_org_ids())));

-- import_rows — through import_files
CREATE POLICY "Org isolation on import_rows" ON import_rows FOR SELECT
  USING (import_file_id IN (SELECT id FROM import_files WHERE org_id IN (SELECT get_user_org_ids())));
CREATE POLICY "Org isolation insert import_rows" ON import_rows FOR INSERT
  WITH CHECK (import_file_id IN (SELECT id FROM import_files WHERE org_id IN (SELECT get_user_org_ids())));

-- import_fields — through import_rows → import_files
CREATE POLICY "Org isolation on import_fields" ON import_fields FOR SELECT
  USING (import_row_id IN (SELECT id FROM import_rows WHERE import_file_id IN (SELECT id FROM import_files WHERE org_id IN (SELECT get_user_org_ids()))));

-- vehicle_aliases, vehicle_assignments, vehicle_tank_configurations — through vehicles
CREATE POLICY "Org isolation on vehicle_aliases" ON vehicle_aliases FOR SELECT
  USING (vehicle_id IN (SELECT id FROM vehicles WHERE org_id IN (SELECT get_user_org_ids())));
CREATE POLICY "Org isolation on vehicle_assignments" ON vehicle_assignments FOR SELECT
  USING (vehicle_id IN (SELECT id FROM vehicles WHERE org_id IN (SELECT get_user_org_ids())));
CREATE POLICY "Org isolation on vehicle_tank_configurations" ON vehicle_tank_configurations FOR SELECT
  USING (vehicle_id IN (SELECT id FROM vehicles WHERE org_id IN (SELECT get_user_org_ids())));

-- card_aliases, card_assignments — through cards
CREATE POLICY "Org isolation on card_aliases" ON card_aliases FOR SELECT
  USING (card_id IN (SELECT id FROM cards WHERE org_id IN (SELECT get_user_org_ids())));
CREATE POLICY "Org isolation on card_assignments" ON card_assignments FOR SELECT
  USING (card_id IN (SELECT id FROM cards WHERE org_id IN (SELECT get_user_org_ids())));

-- driver_aliases — through drivers
CREATE POLICY "Org isolation on driver_aliases" ON driver_aliases FOR SELECT
  USING (driver_id IN (SELECT id FROM drivers WHERE org_id IN (SELECT get_user_org_ids())));

-- station_aliases, station_prices, station_discount_rules — through stations
CREATE POLICY "Org isolation on station_aliases" ON station_aliases FOR SELECT
  USING (station_id IN (SELECT id FROM stations WHERE org_id IN (SELECT get_user_org_ids())));
CREATE POLICY "Org isolation on station_prices" ON station_prices FOR SELECT
  USING (station_id IN (SELECT id FROM stations WHERE org_id IN (SELECT get_user_org_ids())));
CREATE POLICY "Org isolation on station_discount_rules" ON station_discount_rules FOR SELECT
  USING (station_id IN (SELECT id FROM stations WHERE org_id IN (SELECT get_user_org_ids())));

-- product_aliases — through products
CREATE POLICY "Org isolation on product_aliases" ON product_aliases FOR SELECT
  USING (product_id IN (SELECT id FROM products WHERE org_id IN (SELECT get_user_org_ids())));

-- reconciliation_candidates, reconciliation_matches — through runs
CREATE POLICY "Org isolation on reconciliation_candidates" ON reconciliation_candidates FOR SELECT
  USING (run_id IN (SELECT id FROM reconciliation_runs WHERE org_id IN (SELECT get_user_org_ids())));
CREATE POLICY "Org isolation on reconciliation_matches" ON reconciliation_matches FOR SELECT
  USING (run_id IN (SELECT id FROM reconciliation_runs WHERE org_id IN (SELECT get_user_org_ids())));

-- financial_assessments — through reconciliation_matches → runs
CREATE POLICY "Org isolation on financial_assessments" ON financial_assessments FOR SELECT
  USING (reconciliation_match_id IN (
    SELECT id FROM reconciliation_matches WHERE run_id IN (
      SELECT id FROM reconciliation_runs WHERE org_id IN (SELECT get_user_org_ids())
    )
  ));

-- parser_profiles — global read for now
CREATE POLICY "All users can read parser_profiles" ON parser_profiles FOR SELECT
  USING (true);
