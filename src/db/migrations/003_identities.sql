-- ============================================================================
-- Migration 003: Identity Resolution — Vehicles, Cards, Drivers, Trailers,
--                Telematics Devices, OBUs
-- Description: Temporal, alias-based identity resolution for all entities
--              that appear across fuel-card and telematics data sources.
-- ============================================================================

-- =========================
-- TABLE: vehicles
-- =========================
CREATE TABLE vehicles (
    id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id                  UUID NOT NULL REFERENCES organisations (id) ON DELETE CASCADE,
    current_registration    TEXT,
    fleet_number            TEXT,
    vin                     TEXT,
    status                  TEXT NOT NULL DEFAULT 'active',
    created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at              TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT chk_vehicles_status CHECK (status IN ('active', 'inactive', 'disposed', 'unknown'))
);

COMMENT ON TABLE  vehicles                          IS 'Canonical vehicle register. Each row is a single physical vehicle.';
COMMENT ON COLUMN vehicles.id                       IS 'Primary key (UUID v4).';
COMMENT ON COLUMN vehicles.org_id                   IS 'FK → organisations. Tenant scope.';
COMMENT ON COLUMN vehicles.current_registration     IS 'Current licence plate / registration number.';
COMMENT ON COLUMN vehicles.fleet_number             IS 'Internal fleet number assigned by the organisation.';
COMMENT ON COLUMN vehicles.vin                      IS 'Vehicle Identification Number (17 chars).';
COMMENT ON COLUMN vehicles.status                   IS 'Lifecycle status of the vehicle.';

CREATE INDEX idx_vehicles_org_id       ON vehicles (org_id);
CREATE INDEX idx_vehicles_registration ON vehicles (org_id, current_registration);
CREATE INDEX idx_vehicles_fleet_number ON vehicles (org_id, fleet_number);
CREATE INDEX idx_vehicles_vin          ON vehicles (org_id, vin);

CREATE TRIGGER trg_vehicles_updated_at
    BEFORE UPDATE ON vehicles
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- =========================
-- TABLE: vehicle_aliases
-- =========================
CREATE TABLE vehicle_aliases (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    vehicle_id      UUID NOT NULL REFERENCES vehicles (id) ON DELETE CASCADE,
    alias_type      TEXT NOT NULL,
    alias_value     TEXT NOT NULL,
    effective_start DATE,
    effective_end   DATE,
    source          TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT chk_vehicle_aliases_dates CHECK (
        effective_start IS NULL OR effective_end IS NULL OR effective_start <= effective_end
    )
);

COMMENT ON TABLE  vehicle_aliases               IS 'Time-bounded alternative identifiers for a vehicle (old plates, provider-specific IDs, etc.).';
COMMENT ON COLUMN vehicle_aliases.id            IS 'Primary key (UUID v4).';
COMMENT ON COLUMN vehicle_aliases.vehicle_id    IS 'FK → vehicles. The canonical vehicle this alias refers to.';
COMMENT ON COLUMN vehicle_aliases.alias_type    IS 'Type of alias (e.g. registration, fleet_number, provider_id).';
COMMENT ON COLUMN vehicle_aliases.alias_value   IS 'The alias value itself.';
COMMENT ON COLUMN vehicle_aliases.effective_start IS 'Date the alias became valid.';
COMMENT ON COLUMN vehicle_aliases.effective_end   IS 'Date the alias ceased to be valid.';
COMMENT ON COLUMN vehicle_aliases.source        IS 'Where this alias was discovered (e.g. import file name, manual entry).';

CREATE INDEX idx_vehicle_aliases_vehicle_id  ON vehicle_aliases (vehicle_id);
CREATE INDEX idx_vehicle_aliases_value       ON vehicle_aliases (alias_type, alias_value);

-- =========================
-- TABLE: vehicle_assignments
-- =========================
CREATE TABLE vehicle_assignments (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    vehicle_id          UUID NOT NULL REFERENCES vehicles (id) ON DELETE CASCADE,
    assignment_type     TEXT NOT NULL,
    assigned_entity_id  UUID NOT NULL,
    effective_start     DATE,
    effective_end       DATE,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT chk_vehicle_assignments_dates CHECK (
        effective_start IS NULL OR effective_end IS NULL OR effective_start <= effective_end
    )
);

COMMENT ON TABLE  vehicle_assignments                   IS 'Time-bounded assignments of vehicles to cost centres, depots, divisions, etc.';
COMMENT ON COLUMN vehicle_assignments.id                IS 'Primary key (UUID v4).';
COMMENT ON COLUMN vehicle_assignments.vehicle_id        IS 'FK → vehicles.';
COMMENT ON COLUMN vehicle_assignments.assignment_type   IS 'Type of assignment (e.g. cost_centre, depot, division).';
COMMENT ON COLUMN vehicle_assignments.assigned_entity_id IS 'UUID of the entity the vehicle is assigned to.';
COMMENT ON COLUMN vehicle_assignments.effective_start   IS 'Start date of the assignment.';
COMMENT ON COLUMN vehicle_assignments.effective_end     IS 'End date of the assignment.';

CREATE INDEX idx_vehicle_assignments_vehicle_id ON vehicle_assignments (vehicle_id);
CREATE INDEX idx_vehicle_assignments_entity     ON vehicle_assignments (assignment_type, assigned_entity_id);

-- =========================
-- TABLE: vehicle_tank_configurations
-- =========================
CREATE TABLE vehicle_tank_configurations (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    vehicle_id      UUID NOT NULL REFERENCES vehicles (id) ON DELETE CASCADE,
    tank_type       TEXT NOT NULL,
    capacity_litres NUMERIC NOT NULL,
    effective_start DATE,
    effective_end   DATE,
    source          TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT chk_vtc_tank_type CHECK (tank_type IN ('diesel', 'adblue', 'gnr', 'auxiliary')),
    CONSTRAINT chk_vtc_capacity  CHECK (capacity_litres > 0),
    CONSTRAINT chk_vtc_dates     CHECK (
        effective_start IS NULL OR effective_end IS NULL OR effective_start <= effective_end
    )
);

COMMENT ON TABLE  vehicle_tank_configurations                IS 'Known tank capacities per vehicle, time-bounded for configuration changes.';
COMMENT ON COLUMN vehicle_tank_configurations.id             IS 'Primary key (UUID v4).';
COMMENT ON COLUMN vehicle_tank_configurations.vehicle_id     IS 'FK → vehicles.';
COMMENT ON COLUMN vehicle_tank_configurations.tank_type      IS 'Type of tank: diesel, adblue, gnr, or auxiliary.';
COMMENT ON COLUMN vehicle_tank_configurations.capacity_litres IS 'Tank capacity in litres.';
COMMENT ON COLUMN vehicle_tank_configurations.effective_start IS 'Start of the configuration validity period.';
COMMENT ON COLUMN vehicle_tank_configurations.effective_end   IS 'End of the configuration validity period.';
COMMENT ON COLUMN vehicle_tank_configurations.source         IS 'Data source (e.g. fleet_management_system, manual).';

CREATE INDEX idx_vtc_vehicle_id ON vehicle_tank_configurations (vehicle_id);

-- =========================
-- TABLE: cards
-- =========================
CREATE TABLE cards (
    id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id                  UUID NOT NULL REFERENCES organisations (id) ON DELETE CASCADE,
    provider                TEXT NOT NULL,
    raw_identifier          TEXT NOT NULL,
    normalised_identifier   TEXT,
    identifier_type         TEXT,
    equipment_number        TEXT,
    status                  TEXT NOT NULL DEFAULT 'active',
    created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at              TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT chk_cards_status CHECK (status IN ('active', 'inactive', 'blocked', 'expired', 'unknown'))
);

COMMENT ON TABLE  cards                             IS 'Fuel/toll cards. Each physical or virtual card is one row.';
COMMENT ON COLUMN cards.id                          IS 'Primary key (UUID v4).';
COMMENT ON COLUMN cards.org_id                      IS 'FK → organisations. Tenant scope.';
COMMENT ON COLUMN cards.provider                    IS 'Card issuer (e.g. DKV, UTA, Shell).';
COMMENT ON COLUMN cards.raw_identifier              IS 'Identifier exactly as it appears on provider statements.';
COMMENT ON COLUMN cards.normalised_identifier       IS 'Cleaned/normalised card number for matching.';
COMMENT ON COLUMN cards.identifier_type             IS 'Type of identifier (e.g. card_number, contract_number).';
COMMENT ON COLUMN cards.equipment_number            IS 'Equipment/device number associated with the card.';
COMMENT ON COLUMN cards.status                      IS 'Current card status.';

CREATE INDEX idx_cards_org_id               ON cards (org_id);
CREATE INDEX idx_cards_provider             ON cards (org_id, provider);
CREATE INDEX idx_cards_normalised_id        ON cards (normalised_identifier);
CREATE INDEX idx_cards_raw_id               ON cards (provider, raw_identifier);

CREATE TRIGGER trg_cards_updated_at
    BEFORE UPDATE ON cards
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- =========================
-- TABLE: card_aliases
-- =========================
CREATE TABLE card_aliases (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    card_id         UUID NOT NULL REFERENCES cards (id) ON DELETE CASCADE,
    alias_type      TEXT NOT NULL,
    alias_value     TEXT NOT NULL,
    effective_start DATE,
    effective_end   DATE,
    source          TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT chk_card_aliases_dates CHECK (
        effective_start IS NULL OR effective_end IS NULL OR effective_start <= effective_end
    )
);

COMMENT ON TABLE  card_aliases             IS 'Alternative identifiers for a card seen in different provider feeds.';
COMMENT ON COLUMN card_aliases.id          IS 'Primary key (UUID v4).';
COMMENT ON COLUMN card_aliases.card_id     IS 'FK → cards. The canonical card.';
COMMENT ON COLUMN card_aliases.alias_type  IS 'Type of alias (e.g. old_number, partner_number).';
COMMENT ON COLUMN card_aliases.alias_value IS 'The alias value.';

CREATE INDEX idx_card_aliases_card_id ON card_aliases (card_id);
CREATE INDEX idx_card_aliases_value   ON card_aliases (alias_type, alias_value);

-- =========================
-- TABLE: card_assignments
-- =========================
CREATE TABLE card_assignments (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    card_id         UUID NOT NULL REFERENCES cards (id) ON DELETE CASCADE,
    vehicle_id      UUID REFERENCES vehicles (id) ON DELETE SET NULL,
    driver_id       UUID,  -- FK added after drivers table is created
    effective_start DATE,
    effective_end   DATE,
    source          TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT chk_card_assignments_dates CHECK (
        effective_start IS NULL OR effective_end IS NULL OR effective_start <= effective_end
    )
);

COMMENT ON TABLE  card_assignments                IS 'Time-bounded assignment of a card to a vehicle and/or driver.';
COMMENT ON COLUMN card_assignments.id             IS 'Primary key (UUID v4).';
COMMENT ON COLUMN card_assignments.card_id        IS 'FK → cards.';
COMMENT ON COLUMN card_assignments.vehicle_id     IS 'FK → vehicles. Nullable.';
COMMENT ON COLUMN card_assignments.driver_id      IS 'FK → drivers (added after drivers table creation). Nullable.';
COMMENT ON COLUMN card_assignments.effective_start IS 'Start date of assignment.';
COMMENT ON COLUMN card_assignments.effective_end   IS 'End date of assignment.';
COMMENT ON COLUMN card_assignments.source         IS 'Data source.';

CREATE INDEX idx_card_assignments_card_id    ON card_assignments (card_id);
CREATE INDEX idx_card_assignments_vehicle_id ON card_assignments (vehicle_id);

-- =========================
-- TABLE: drivers
-- =========================
CREATE TABLE drivers (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id      UUID NOT NULL REFERENCES organisations (id) ON DELETE CASCADE,
    name        TEXT NOT NULL,
    identifier  TEXT,
    status      TEXT NOT NULL DEFAULT 'active',
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT chk_drivers_status CHECK (status IN ('active', 'inactive', 'unknown'))
);

COMMENT ON TABLE  drivers              IS 'Canonical driver register.';
COMMENT ON COLUMN drivers.id           IS 'Primary key (UUID v4).';
COMMENT ON COLUMN drivers.org_id       IS 'FK → organisations. Tenant scope.';
COMMENT ON COLUMN drivers.name         IS 'Driver display name.';
COMMENT ON COLUMN drivers.identifier   IS 'Driver ID / badge number.';
COMMENT ON COLUMN drivers.status       IS 'Current status.';

CREATE INDEX idx_drivers_org_id      ON drivers (org_id);
CREATE INDEX idx_drivers_identifier  ON drivers (org_id, identifier);

CREATE TRIGGER trg_drivers_updated_at
    BEFORE UPDATE ON drivers
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Add deferred FK from card_assignments to drivers
ALTER TABLE card_assignments
    ADD CONSTRAINT fk_card_assignments_driver
    FOREIGN KEY (driver_id) REFERENCES drivers (id) ON DELETE SET NULL;

CREATE INDEX idx_card_assignments_driver_id ON card_assignments (driver_id);

-- =========================
-- TABLE: driver_aliases
-- =========================
CREATE TABLE driver_aliases (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    driver_id       UUID NOT NULL REFERENCES drivers (id) ON DELETE CASCADE,
    alias_type      TEXT NOT NULL,
    alias_value     TEXT NOT NULL,
    effective_start DATE,
    effective_end   DATE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT chk_driver_aliases_dates CHECK (
        effective_start IS NULL OR effective_end IS NULL OR effective_start <= effective_end
    )
);

COMMENT ON TABLE  driver_aliases               IS 'Alternative names or identifiers for a driver across different provider feeds.';
COMMENT ON COLUMN driver_aliases.id            IS 'Primary key (UUID v4).';
COMMENT ON COLUMN driver_aliases.driver_id     IS 'FK → drivers.';
COMMENT ON COLUMN driver_aliases.alias_type    IS 'Type of alias (e.g. name_variant, provider_id).';
COMMENT ON COLUMN driver_aliases.alias_value   IS 'The alias value.';

CREATE INDEX idx_driver_aliases_driver_id ON driver_aliases (driver_id);
CREATE INDEX idx_driver_aliases_value     ON driver_aliases (alias_type, alias_value);

-- =========================
-- TABLE: trailers
-- =========================
CREATE TABLE trailers (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id      UUID NOT NULL REFERENCES organisations (id) ON DELETE CASCADE,
    identifier  TEXT NOT NULL,
    status      TEXT NOT NULL DEFAULT 'active',
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT chk_trailers_status CHECK (status IN ('active', 'inactive', 'disposed', 'unknown'))
);

COMMENT ON TABLE  trailers              IS 'Canonical trailer register.';
COMMENT ON COLUMN trailers.id           IS 'Primary key (UUID v4).';
COMMENT ON COLUMN trailers.org_id       IS 'FK → organisations. Tenant scope.';
COMMENT ON COLUMN trailers.identifier   IS 'Trailer registration or fleet number.';
COMMENT ON COLUMN trailers.status       IS 'Current status.';

CREATE INDEX idx_trailers_org_id      ON trailers (org_id);
CREATE INDEX idx_trailers_identifier  ON trailers (org_id, identifier);

CREATE TRIGGER trg_trailers_updated_at
    BEFORE UPDATE ON trailers
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- =========================
-- TABLE: telematics_devices
-- =========================
CREATE TABLE telematics_devices (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id              UUID NOT NULL REFERENCES organisations (id) ON DELETE CASCADE,
    device_identifier   TEXT NOT NULL,
    device_type         TEXT,
    vehicle_id          UUID REFERENCES vehicles (id) ON DELETE SET NULL,
    effective_start     DATE,
    effective_end       DATE,
    status              TEXT NOT NULL DEFAULT 'active',
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT chk_telematics_devices_status CHECK (status IN ('active', 'inactive', 'unknown')),
    CONSTRAINT chk_telematics_devices_dates  CHECK (
        effective_start IS NULL OR effective_end IS NULL OR effective_start <= effective_end
    )
);

COMMENT ON TABLE  telematics_devices                   IS 'Telematics hardware installed in vehicles.';
COMMENT ON COLUMN telematics_devices.id                IS 'Primary key (UUID v4).';
COMMENT ON COLUMN telematics_devices.org_id            IS 'FK → organisations. Tenant scope.';
COMMENT ON COLUMN telematics_devices.device_identifier IS 'Serial number or provider device ID.';
COMMENT ON COLUMN telematics_devices.device_type       IS 'Hardware type (e.g. fleetboard, transics, webfleet).';
COMMENT ON COLUMN telematics_devices.vehicle_id        IS 'FK → vehicles. Currently installed vehicle.';
COMMENT ON COLUMN telematics_devices.effective_start   IS 'When the device was installed in the current vehicle.';
COMMENT ON COLUMN telematics_devices.effective_end     IS 'When the device was removed.';
COMMENT ON COLUMN telematics_devices.status            IS 'Current device status.';

CREATE INDEX idx_telematics_devices_org_id     ON telematics_devices (org_id);
CREATE INDEX idx_telematics_devices_vehicle_id ON telematics_devices (vehicle_id);
CREATE INDEX idx_telematics_devices_identifier ON telematics_devices (org_id, device_identifier);

CREATE TRIGGER trg_telematics_devices_updated_at
    BEFORE UPDATE ON telematics_devices
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- =========================
-- TABLE: obus (On-Board Units)
-- =========================
CREATE TABLE obus (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id              UUID NOT NULL REFERENCES organisations (id) ON DELETE CASCADE,
    obu_identifier      TEXT NOT NULL,
    vehicle_id          UUID REFERENCES vehicles (id) ON DELETE SET NULL,
    max_gross_weight    NUMERIC,
    euroclass           TEXT,
    effective_start     DATE,
    effective_end       DATE,
    status              TEXT NOT NULL DEFAULT 'active',
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT chk_obus_status CHECK (status IN ('active', 'inactive', 'unknown')),
    CONSTRAINT chk_obus_dates  CHECK (
        effective_start IS NULL OR effective_end IS NULL OR effective_start <= effective_end
    ),
    CONSTRAINT chk_obus_weight CHECK (max_gross_weight IS NULL OR max_gross_weight > 0)
);

COMMENT ON TABLE  obus                      IS 'Toll On-Board Units — devices for electronic toll collection.';
COMMENT ON COLUMN obus.id                   IS 'Primary key (UUID v4).';
COMMENT ON COLUMN obus.org_id               IS 'FK → organisations. Tenant scope.';
COMMENT ON COLUMN obus.obu_identifier       IS 'OBU serial number or provider device ID.';
COMMENT ON COLUMN obus.vehicle_id           IS 'FK → vehicles. Vehicle the OBU is installed in.';
COMMENT ON COLUMN obus.max_gross_weight     IS 'Maximum gross vehicle weight in kg (for toll calculation).';
COMMENT ON COLUMN obus.euroclass            IS 'Euro emission class (e.g. EURO6, EURO5).';
COMMENT ON COLUMN obus.effective_start      IS 'Start of the OBU assignment period.';
COMMENT ON COLUMN obus.effective_end        IS 'End of the OBU assignment period.';
COMMENT ON COLUMN obus.status              IS 'Current OBU status.';

CREATE INDEX idx_obus_org_id        ON obus (org_id);
CREATE INDEX idx_obus_vehicle_id    ON obus (vehicle_id);
CREATE INDEX idx_obus_identifier    ON obus (org_id, obu_identifier);

CREATE TRIGGER trg_obus_updated_at
    BEFORE UPDATE ON obus
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
