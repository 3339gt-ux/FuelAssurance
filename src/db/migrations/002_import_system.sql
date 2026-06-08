-- ============================================================================
-- Migration 002: Import System
-- Description: File ingestion pipeline — files, pages, rows, fields,
--              column mappings, and parser profiles.
-- ============================================================================

-- =========================
-- TABLE: import_files
-- =========================
CREATE TABLE import_files (
    id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id                  UUID NOT NULL REFERENCES organisations (id) ON DELETE CASCADE,
    file_name               TEXT NOT NULL,
    provider                TEXT NOT NULL,
    document_type           TEXT NOT NULL,
    file_hash               TEXT NOT NULL,
    file_size               BIGINT NOT NULL,
    mime_type               TEXT,
    upload_date             TIMESTAMPTZ NOT NULL DEFAULT now(),
    uploaded_by             UUID NOT NULL REFERENCES users (id),
    source_period_start     DATE,
    source_period_end       DATE,
    original_storage_path   TEXT,
    parser_version          TEXT,
    mapping_version         TEXT,
    import_status           TEXT NOT NULL DEFAULT 'pending',
    row_count               INT,
    page_count              INT,
    warning_count           INT DEFAULT 0,
    error_count             INT DEFAULT 0,
    control_total_status    TEXT,
    processing_duration_ms  INT,
    metadata                JSONB DEFAULT '{}'::jsonb,
    created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at              TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT chk_import_files_status CHECK (
        import_status IN ('pending', 'uploading', 'parsing', 'mapping', 'validating',
                          'completed', 'completed_with_warnings', 'failed', 'cancelled')
    ),
    CONSTRAINT chk_import_files_control_total CHECK (
        control_total_status IS NULL OR control_total_status IN ('matched', 'unmatched', 'not_applicable')
    ),
    CONSTRAINT chk_import_files_period CHECK (
        source_period_start IS NULL OR source_period_end IS NULL OR source_period_start <= source_period_end
    )
);

COMMENT ON TABLE  import_files                          IS 'Each row represents a single uploaded document (CSV, PDF, XLSX) entering the import pipeline.';
COMMENT ON COLUMN import_files.id                       IS 'Primary key (UUID v4).';
COMMENT ON COLUMN import_files.org_id                   IS 'FK → organisations. Tenant scope.';
COMMENT ON COLUMN import_files.file_name                IS 'Original file name as uploaded by the user.';
COMMENT ON COLUMN import_files.provider                 IS 'Fuel-card or telematics provider (e.g. DKV, UTA, Fleetboard).';
COMMENT ON COLUMN import_files.document_type            IS 'Document category (e.g. transaction_report, invoice, telematics_export).';
COMMENT ON COLUMN import_files.file_hash                IS 'SHA-256 hash of the raw file for deduplication.';
COMMENT ON COLUMN import_files.file_size                IS 'File size in bytes.';
COMMENT ON COLUMN import_files.mime_type                IS 'MIME type of the uploaded file.';
COMMENT ON COLUMN import_files.upload_date              IS 'When the file was uploaded.';
COMMENT ON COLUMN import_files.uploaded_by              IS 'FK → users. Who uploaded the file.';
COMMENT ON COLUMN import_files.source_period_start      IS 'Start of the reporting period the file covers.';
COMMENT ON COLUMN import_files.source_period_end        IS 'End of the reporting period the file covers.';
COMMENT ON COLUMN import_files.original_storage_path    IS 'Path in Supabase Storage or S3 bucket.';
COMMENT ON COLUMN import_files.parser_version           IS 'Version of the parser used to extract data.';
COMMENT ON COLUMN import_files.mapping_version          IS 'Version of the column mapping applied.';
COMMENT ON COLUMN import_files.import_status            IS 'Current pipeline stage of the import.';
COMMENT ON COLUMN import_files.row_count                IS 'Total data rows extracted.';
COMMENT ON COLUMN import_files.page_count               IS 'Number of pages (for PDFs).';
COMMENT ON COLUMN import_files.warning_count            IS 'Count of non-fatal warnings during parsing.';
COMMENT ON COLUMN import_files.error_count              IS 'Count of fatal errors during parsing.';
COMMENT ON COLUMN import_files.control_total_status     IS 'Whether the control totals match the parsed data.';
COMMENT ON COLUMN import_files.processing_duration_ms   IS 'Total processing time in milliseconds.';
COMMENT ON COLUMN import_files.metadata                 IS 'Flexible JSONB bag for provider-specific metadata.';

CREATE INDEX idx_import_files_org_id       ON import_files (org_id);
CREATE INDEX idx_import_files_file_hash    ON import_files (file_hash);
CREATE INDEX idx_import_files_provider     ON import_files (org_id, provider);
CREATE INDEX idx_import_files_status       ON import_files (org_id, import_status);
CREATE INDEX idx_import_files_upload_date  ON import_files (org_id, upload_date DESC);

CREATE TRIGGER trg_import_files_updated_at
    BEFORE UPDATE ON import_files
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- =========================
-- TABLE: import_pages
-- =========================
CREATE TABLE import_pages (
    id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    import_file_id          UUID NOT NULL REFERENCES import_files (id) ON DELETE CASCADE,
    page_number             INT NOT NULL,
    raw_text                TEXT,
    extraction_method       TEXT,
    extraction_confidence   NUMERIC(5,4),
    warnings                JSONB DEFAULT '[]'::jsonb,
    created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT uq_import_pages_file_page UNIQUE (import_file_id, page_number),
    CONSTRAINT chk_import_pages_confidence CHECK (
        extraction_confidence IS NULL OR (extraction_confidence >= 0 AND extraction_confidence <= 1)
    )
);

COMMENT ON TABLE  import_pages                        IS 'Per-page extraction results for multi-page documents (PDFs).';
COMMENT ON COLUMN import_pages.id                     IS 'Primary key (UUID v4).';
COMMENT ON COLUMN import_pages.import_file_id         IS 'FK → import_files. Parent file.';
COMMENT ON COLUMN import_pages.page_number            IS '1-based page number within the document.';
COMMENT ON COLUMN import_pages.raw_text               IS 'Full extracted text of the page.';
COMMENT ON COLUMN import_pages.extraction_method      IS 'How text was extracted (e.g. pdfplumber, ocr_tesseract, ocr_vision).';
COMMENT ON COLUMN import_pages.extraction_confidence  IS 'Confidence score 0.0–1.0 for the extraction quality.';
COMMENT ON COLUMN import_pages.warnings               IS 'Array of warning objects produced during extraction.';

CREATE INDEX idx_import_pages_file_id ON import_pages (import_file_id);

-- =========================
-- TABLE: import_rows
-- =========================
CREATE TABLE import_rows (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    import_file_id      UUID NOT NULL REFERENCES import_files (id) ON DELETE CASCADE,
    import_page_id      UUID REFERENCES import_pages (id) ON DELETE SET NULL,
    sheet_name          TEXT,
    source_row_number   INT NOT NULL,
    raw_data            JSONB NOT NULL,
    normalised_data     JSONB,
    status              TEXT NOT NULL DEFAULT 'pending',
    warnings            JSONB DEFAULT '[]'::jsonb,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT chk_import_rows_status CHECK (
        status IN ('pending', 'mapped', 'validated', 'imported', 'skipped', 'error')
    )
);

COMMENT ON TABLE  import_rows                   IS 'One row per logical data row extracted from an import file.';
COMMENT ON COLUMN import_rows.id                IS 'Primary key (UUID v4).';
COMMENT ON COLUMN import_rows.import_file_id    IS 'FK → import_files. Parent file.';
COMMENT ON COLUMN import_rows.import_page_id    IS 'FK → import_pages. Nullable — only set for page-based documents.';
COMMENT ON COLUMN import_rows.sheet_name        IS 'Excel sheet name (for XLSX files with multiple sheets).';
COMMENT ON COLUMN import_rows.source_row_number IS 'Row number in the original file (1-based).';
COMMENT ON COLUMN import_rows.raw_data          IS 'Raw key-value pairs as extracted.';
COMMENT ON COLUMN import_rows.normalised_data   IS 'Data after column mapping and type normalisation.';
COMMENT ON COLUMN import_rows.status            IS 'Processing status of the row.';
COMMENT ON COLUMN import_rows.warnings          IS 'Array of warning objects produced during mapping/validation.';

CREATE INDEX idx_import_rows_file_id ON import_rows (import_file_id);
CREATE INDEX idx_import_rows_status  ON import_rows (import_file_id, status);

-- =========================
-- TABLE: import_fields
-- =========================
CREATE TABLE import_fields (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    import_row_id       UUID NOT NULL REFERENCES import_rows (id) ON DELETE CASCADE,
    field_name          TEXT NOT NULL,
    raw_value           TEXT,
    normalised_value    TEXT,
    confidence          NUMERIC(5,4),
    source_page         INT,
    source_coordinates  JSONB,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT chk_import_fields_confidence CHECK (
        confidence IS NULL OR (confidence >= 0 AND confidence <= 1)
    )
);

COMMENT ON TABLE  import_fields                    IS 'Per-field extraction detail for OCR/PDF sources where field-level confidence matters.';
COMMENT ON COLUMN import_fields.id                 IS 'Primary key (UUID v4).';
COMMENT ON COLUMN import_fields.import_row_id      IS 'FK → import_rows. Parent row.';
COMMENT ON COLUMN import_fields.field_name         IS 'Canonical field name after mapping.';
COMMENT ON COLUMN import_fields.raw_value          IS 'Value as extracted from the source.';
COMMENT ON COLUMN import_fields.normalised_value   IS 'Value after normalisation (type coercion, trimming).';
COMMENT ON COLUMN import_fields.confidence         IS 'Confidence score 0.0–1.0 for the field extraction.';
COMMENT ON COLUMN import_fields.source_page        IS 'Page number this field was extracted from.';
COMMENT ON COLUMN import_fields.source_coordinates IS 'Bounding box or positional data for the field on the page.';

CREATE INDEX idx_import_fields_row_id ON import_fields (import_row_id);

-- =========================
-- TABLE: import_mappings
-- =========================
CREATE TABLE import_mappings (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id            UUID NOT NULL REFERENCES organisations (id) ON DELETE CASCADE,
    provider          TEXT NOT NULL,
    document_type     TEXT NOT NULL,
    version           INT NOT NULL DEFAULT 1,
    column_mappings   JSONB NOT NULL,
    approved_by       UUID REFERENCES users (id),
    approved_at       TIMESTAMPTZ,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT uq_import_mappings_org_provider_doc_ver UNIQUE (org_id, provider, document_type, version)
);

COMMENT ON TABLE  import_mappings                 IS 'Organisation-specific column-mapping rules that translate provider columns to canonical field names.';
COMMENT ON COLUMN import_mappings.id              IS 'Primary key (UUID v4).';
COMMENT ON COLUMN import_mappings.org_id          IS 'FK → organisations. Tenant scope.';
COMMENT ON COLUMN import_mappings.provider        IS 'Provider whose documents this mapping applies to.';
COMMENT ON COLUMN import_mappings.document_type   IS 'Document category this mapping handles.';
COMMENT ON COLUMN import_mappings.version         IS 'Monotonically increasing version number.';
COMMENT ON COLUMN import_mappings.column_mappings IS 'JSONB object mapping source column names/positions to canonical field names.';
COMMENT ON COLUMN import_mappings.approved_by     IS 'FK → users. Who approved this mapping version.';
COMMENT ON COLUMN import_mappings.approved_at     IS 'When the mapping was approved.';

CREATE INDEX idx_import_mappings_org_id   ON import_mappings (org_id);
CREATE INDEX idx_import_mappings_provider ON import_mappings (org_id, provider, document_type);

-- =========================
-- TABLE: parser_profiles
-- =========================
CREATE TABLE parser_profiles (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    provider         TEXT NOT NULL,
    document_type    TEXT NOT NULL,
    version          TEXT NOT NULL,
    heading_aliases  JSONB DEFAULT '{}'::jsonb,
    parsing_rules    JSONB DEFAULT '{}'::jsonb,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT uq_parser_profiles_provider_doc_ver UNIQUE (provider, document_type, version)
);

COMMENT ON TABLE  parser_profiles                 IS 'Global parser configuration per provider/document_type. Defines how to read and interpret a specific file format.';
COMMENT ON COLUMN parser_profiles.id              IS 'Primary key (UUID v4).';
COMMENT ON COLUMN parser_profiles.provider        IS 'Provider whose files this profile handles.';
COMMENT ON COLUMN parser_profiles.document_type   IS 'Document category.';
COMMENT ON COLUMN parser_profiles.version         IS 'Semantic version string.';
COMMENT ON COLUMN parser_profiles.heading_aliases IS 'JSONB map of known heading variations to canonical names.';
COMMENT ON COLUMN parser_profiles.parsing_rules   IS 'JSONB rules controlling row detection, skip logic, type coercion, etc.';

CREATE INDEX idx_parser_profiles_provider ON parser_profiles (provider, document_type);

CREATE TRIGGER trg_parser_profiles_updated_at
    BEFORE UPDATE ON parser_profiles
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- =========================
-- TABLE: parser_versions
-- =========================
CREATE TABLE parser_versions (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    parser_profile_id   UUID NOT NULL REFERENCES parser_profiles (id) ON DELETE CASCADE,
    version             TEXT NOT NULL,
    changes             TEXT,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT uq_parser_versions_profile_version UNIQUE (parser_profile_id, version)
);

COMMENT ON TABLE  parser_versions                   IS 'Change log for parser profile versions.';
COMMENT ON COLUMN parser_versions.id                IS 'Primary key (UUID v4).';
COMMENT ON COLUMN parser_versions.parser_profile_id IS 'FK → parser_profiles. Parent profile.';
COMMENT ON COLUMN parser_versions.version           IS 'Version string matching the parser_profiles.version.';
COMMENT ON COLUMN parser_versions.changes           IS 'Human-readable description of what changed.';

CREATE INDEX idx_parser_versions_profile_id ON parser_versions (parser_profile_id);
