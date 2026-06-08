-- ============================================================================
-- Migration 004: Master Data — Stations & Products
-- Description: Reference data for fuelling stations, pricing, discounts,
--              and product catalogues.
-- ============================================================================

-- =========================
-- TABLE: stations
-- =========================
CREATE TABLE stations (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id          UUID NOT NULL REFERENCES organisations (id) ON DELETE CASCADE,
    provider        TEXT,
    network         TEXT,
    country         TEXT,
    station_code    TEXT,
    station_name    TEXT,
    city            TEXT,
    address         TEXT,
    postal_code     TEXT,
    latitude        NUMERIC(10,7),
    longitude       NUMERIC(10,7),
    status          TEXT NOT NULL DEFAULT 'active',
    source_file     TEXT,
    notes           TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT chk_stations_status CHECK (status IN ('active', 'inactive', 'closed', 'unknown')),
    CONSTRAINT chk_stations_latitude  CHECK (latitude  IS NULL OR (latitude  >= -90 AND latitude  <= 90)),
    CONSTRAINT chk_stations_longitude CHECK (longitude IS NULL OR (longitude >= -180 AND longitude <= 180))
);

COMMENT ON TABLE  stations                IS 'Fuelling / service station reference data.';
COMMENT ON COLUMN stations.id             IS 'Primary key (UUID v4).';
COMMENT ON COLUMN stations.org_id         IS 'FK → organisations. Tenant scope.';
COMMENT ON COLUMN stations.provider       IS 'Card network provider that lists this station.';
COMMENT ON COLUMN stations.network        IS 'Station brand/network (e.g. Shell, BP, Total).';
COMMENT ON COLUMN stations.country        IS 'ISO 3166-1 alpha-2 country code.';
COMMENT ON COLUMN stations.station_code   IS 'Provider-specific station identifier.';
COMMENT ON COLUMN stations.station_name   IS 'Station display name.';
COMMENT ON COLUMN stations.city           IS 'City where the station is located.';
COMMENT ON COLUMN stations.address        IS 'Street address.';
COMMENT ON COLUMN stations.postal_code    IS 'Postal / ZIP code.';
COMMENT ON COLUMN stations.latitude       IS 'WGS84 latitude (-90 to 90).';
COMMENT ON COLUMN stations.longitude      IS 'WGS84 longitude (-180 to 180).';
COMMENT ON COLUMN stations.status         IS 'Current operational status of the station.';
COMMENT ON COLUMN stations.source_file    IS 'File or feed from which this station was imported.';
COMMENT ON COLUMN stations.notes          IS 'Free-text notes.';

CREATE INDEX idx_stations_org_id        ON stations (org_id);
CREATE INDEX idx_stations_provider      ON stations (org_id, provider);
CREATE INDEX idx_stations_country       ON stations (org_id, country);
CREATE INDEX idx_stations_station_code  ON stations USING gin (station_code gin_trgm_ops);
CREATE INDEX idx_stations_name          ON stations (org_id, station_name);
CREATE INDEX idx_stations_code_exact    ON stations (org_id, station_code);

-- Enable the pg_trgm extension for the GIN trigram index
CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE TRIGGER trg_stations_updated_at
    BEFORE UPDATE ON stations
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- =========================
-- TABLE: station_aliases
-- =========================
CREATE TABLE station_aliases (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    station_id      UUID NOT NULL REFERENCES stations (id) ON DELETE CASCADE,
    alias_type      TEXT NOT NULL,
    alias_value     TEXT NOT NULL,
    effective_start DATE,
    effective_end   DATE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT chk_station_aliases_dates CHECK (
        effective_start IS NULL OR effective_end IS NULL OR effective_start <= effective_end
    )
);

COMMENT ON TABLE  station_aliases               IS 'Alternative identifiers or names for a station across different provider feeds.';
COMMENT ON COLUMN station_aliases.id            IS 'Primary key (UUID v4).';
COMMENT ON COLUMN station_aliases.station_id    IS 'FK → stations.';
COMMENT ON COLUMN station_aliases.alias_type    IS 'Type of alias (e.g. station_code, name_variant, old_code).';
COMMENT ON COLUMN station_aliases.alias_value   IS 'The alias value.';
COMMENT ON COLUMN station_aliases.effective_start IS 'Start of alias validity.';
COMMENT ON COLUMN station_aliases.effective_end   IS 'End of alias validity.';

CREATE INDEX idx_station_aliases_station_id ON station_aliases (station_id);
CREATE INDEX idx_station_aliases_value      ON station_aliases (alias_type, alias_value);

-- =========================
-- TABLE: station_prices
-- =========================
CREATE TABLE station_prices (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    station_id      UUID NOT NULL REFERENCES stations (id) ON DELETE CASCADE,
    product         TEXT NOT NULL,
    price           NUMERIC NOT NULL,
    currency        TEXT NOT NULL DEFAULT 'EUR',
    effective_start DATE,
    effective_end   DATE,
    source          TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT chk_station_prices_price CHECK (price >= 0),
    CONSTRAINT chk_station_prices_dates CHECK (
        effective_start IS NULL OR effective_end IS NULL OR effective_start <= effective_end
    )
);

COMMENT ON TABLE  station_prices               IS 'Time-bounded pump prices per product at a station.';
COMMENT ON COLUMN station_prices.id            IS 'Primary key (UUID v4).';
COMMENT ON COLUMN station_prices.station_id    IS 'FK → stations.';
COMMENT ON COLUMN station_prices.product       IS 'Product name or code (e.g. diesel, adblue).';
COMMENT ON COLUMN station_prices.price         IS 'Price per unit (usually per litre).';
COMMENT ON COLUMN station_prices.currency      IS 'ISO 4217 currency code, default EUR.';
COMMENT ON COLUMN station_prices.effective_start IS 'Price valid from this date.';
COMMENT ON COLUMN station_prices.effective_end   IS 'Price valid until this date.';
COMMENT ON COLUMN station_prices.source        IS 'Source of the price data.';

CREATE INDEX idx_station_prices_station_id ON station_prices (station_id);
CREATE INDEX idx_station_prices_product    ON station_prices (station_id, product);

-- =========================
-- TABLE: station_discount_rules
-- =========================
CREATE TABLE station_discount_rules (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    station_id      UUID NOT NULL REFERENCES stations (id) ON DELETE CASCADE,
    discount_type   TEXT NOT NULL,
    discount_value  NUMERIC,
    fee_value       NUMERIC,
    rebate_value    NUMERIC,
    effective_start DATE,
    effective_end   DATE,
    source          TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT chk_station_discount_dates CHECK (
        effective_start IS NULL OR effective_end IS NULL OR effective_start <= effective_end
    )
);

COMMENT ON TABLE  station_discount_rules                IS 'Discount, fee, and rebate rules applicable at a station.';
COMMENT ON COLUMN station_discount_rules.id             IS 'Primary key (UUID v4).';
COMMENT ON COLUMN station_discount_rules.station_id     IS 'FK → stations.';
COMMENT ON COLUMN station_discount_rules.discount_type  IS 'Type of discount (e.g. network_discount, volume_rebate, service_fee).';
COMMENT ON COLUMN station_discount_rules.discount_value IS 'Discount amount (absolute or percentage depending on type).';
COMMENT ON COLUMN station_discount_rules.fee_value      IS 'Fee amount.';
COMMENT ON COLUMN station_discount_rules.rebate_value   IS 'Rebate amount.';
COMMENT ON COLUMN station_discount_rules.effective_start IS 'Rule valid from.';
COMMENT ON COLUMN station_discount_rules.effective_end   IS 'Rule valid until.';
COMMENT ON COLUMN station_discount_rules.source         IS 'Source of the rule (e.g. contract, rate_card).';

CREATE INDEX idx_station_discount_rules_station_id ON station_discount_rules (station_id);

-- =========================
-- TABLE: products
-- =========================
CREATE TABLE products (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id          UUID NOT NULL REFERENCES organisations (id) ON DELETE CASCADE,
    product_code    TEXT NOT NULL,
    product_name    TEXT NOT NULL,
    product_group   TEXT,
    product_type    TEXT NOT NULL,
    unit            TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT chk_products_type CHECK (
        product_type IN ('fuel_diesel', 'fuel_adblue', 'fuel_gnr', 'toll', 'parking', 'cleaning', 'service', 'other')
    ),
    CONSTRAINT uq_products_org_code UNIQUE (org_id, product_code)
);

COMMENT ON TABLE  products                IS 'Canonical product catalogue for an organisation.';
COMMENT ON COLUMN products.id             IS 'Primary key (UUID v4).';
COMMENT ON COLUMN products.org_id         IS 'FK → organisations. Tenant scope.';
COMMENT ON COLUMN products.product_code   IS 'Unique product code within the organisation.';
COMMENT ON COLUMN products.product_name   IS 'Human-readable product name.';
COMMENT ON COLUMN products.product_group  IS 'Grouping category (e.g. fuel, services, toll).';
COMMENT ON COLUMN products.product_type   IS 'Enumerated product type for analytics.';
COMMENT ON COLUMN products.unit           IS 'Unit of measure (e.g. litres, km, count).';

CREATE INDEX idx_products_org_id   ON products (org_id);
CREATE INDEX idx_products_type     ON products (org_id, product_type);

CREATE TRIGGER trg_products_updated_at
    BEFORE UPDATE ON products
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- =========================
-- TABLE: product_aliases
-- =========================
CREATE TABLE product_aliases (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    product_id      UUID NOT NULL REFERENCES products (id) ON DELETE CASCADE,
    alias_code      TEXT NOT NULL,
    alias_name      TEXT,
    provider        TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE  product_aliases              IS 'Provider-specific product codes that map to the canonical product.';
COMMENT ON COLUMN product_aliases.id           IS 'Primary key (UUID v4).';
COMMENT ON COLUMN product_aliases.product_id   IS 'FK → products.';
COMMENT ON COLUMN product_aliases.alias_code   IS 'Provider product code.';
COMMENT ON COLUMN product_aliases.alias_name   IS 'Provider product name.';
COMMENT ON COLUMN product_aliases.provider     IS 'Which provider uses this alias.';

CREATE INDEX idx_product_aliases_product_id ON product_aliases (product_id);
CREATE INDEX idx_product_aliases_code       ON product_aliases (alias_code);
CREATE INDEX idx_product_aliases_provider   ON product_aliases (provider, alias_code);
