# Phased Implementation Plan

This document details the phased rollout plan for the Fuel Assurance platform. It maps out the path from the core foundation layer to production deployment and lists future iterations.

---

## 1. Project Implementation Roadmap

The system is developed in six distinct phases to ensure a stable foundation before layers are integrated.

```
┌────────────────────────────────────────────────────────────────────────┐
│ Phase 1: Foundation (Ingestion & Schema Hardening)                     │
│ └─ Discovered schemas, fuzzy aliases, normalisation layer, file checks  │
└────────────────────────────────────────────────┬───────────────────────┘
                                                 │
                                                 ▼
┌────────────────────────────────────────────────────────────────────────┐
│ Phase 2: Core Processing Engines                                       │
│ └─ 9-Stage Matching, Decimal.js financial checks, Telematics scoring   │
└────────────────────────────────────────────────┬───────────────────────┘
                                                 │
                                                 ▼
┌────────────────────────────────────────────────────────────────────────┐
│ Phase 3: Reasoning Ledger & Asset Aliases                             │
│ └─ Immutable reasoning records, date-aware vehicle & card aliases      │
└────────────────────────────────────────────────┬───────────────────────┘
                                                 │
                                                 ▼
┌────────────────────────────────────────────────────────────────────────┐
│ Phase 4: Database Infrastructure & RLS                                 │
│ └─ Migrations 001-008, Supabase RLS policies, secure signed URLs       │
└────────────────────────────────────────────────┬───────────────────────┘
                                                 │
                                                 ▼
┌────────────────────────────────────────────────────────────────────────┐
│ Phase 5: UI/UX Dashboard & Analytics                                   │
│ └─ Dashboard analytics, exceptions list, "How was this calculated?" drawer│
└────────────────────────────────────────────────┬───────────────────────┘
                                                 │
                                                 ▼
┌────────────────────────────────────────────────────────────────────────┐
│ Phase 6: Future Production Enhancements                                │
│ └─ PDF OCR extraction, geocoding for text-based positions, ML anomaly  │
└────────────────────────────────────────────────────────────────────────┘
```

---

## 2. Phase-by-Phase Work Breakdown

### Phase 1: Foundation (Data Ingestion) — [COMPLETED]
* **Milestones:**
  * Build the Column Alias Registry supporting fuzzy header matching.
  * Implement Excel parsers for DKV transactions, invoices, GPS logs, and approved station sheets.
  * Implement the AS24 PDF parser.
  * Build the normalisation layer to standardize station codes, card numbers, timezone offsets, and Excel serial dates.
* **Verification:** Run unit tests using sample Excel spreadsheets and PDF invoices.

### Phase 2: Core Engines — [COMPLETED]
* **Milestones:**
  * Build the progressive 9-stage matching engine with one-to-one mapping rules.
  * Implement the Decimal.js Financial Validation Engine to verify pricing, VAT, fees, and discounts against tolerances.
  * Implement the Telematics Scoring Engine using weighted scoring dimensions (Time, Location text matching, Fuel levels, Stop status, Volume, Odometer).
* **Verification:** Match transactions against invoices and check calculated confidence scores against GPS pings.

### Phase 3: Reasoning Ledger & Aliasing — [COMPLETED]
* **Milestones:**
  * Define the JSON schemas for the reasoning ledger tables, evidence lists, and ruleset versions.
  * Implement date-aware alias lookup models for vehicles and fuel cards.
  * Create mock services for identity mapping queues.
* **Verification:** Verify that registration plate changes resolve to correct vehicle IDs based on transaction dates.

### Phase 4: Database Infrastructure & Storage Integration — [IN PROGRESS]
* **Milestones:**
  * Apply migrations 001 to 008, setting up tables for organizations, user profiles, imports, reconciliation runs, and logs.
  * Enable RLS policies across all tables.
  * Configure Supabase Storage with bucket policies restricting access to organization directories.
  * Integrate Next.js API route handlers to sign storage access tokens.
* **Verification:** Test multi-tenant isolation by verifying that queries from Tenant A fail to read Tenant B records.

### Phase 5: Dashboard and Frontend Interface — [IN PROGRESS]
* **Milestones:**
  * Build UI screens using Tailwind CSS.
  * Create the Imports dashboard showing upload history and template drift alerts.
  * Create the detailed Reconciliation page with view filters (Full, Exceptions, Evidence).
  * Build the interactive "How was this calculated?" audit drawer.
  * Implement the safe export exporter (sanitizing spreadsheet cells).
* **Verification:** Perform user acceptance testing on data displays and audit exports.

### Phase 6: Future Iterations & Advanced Enhancements — [PLANNED]
* **Milestones:**
  * **AS24 PDF OCR Pipeline:** Integrate an OCR engine (such as AWS Textract) to process scanned or low-resolution paper AS24 invoice uploads.
  * **Geocoding & Spatial Location:** If latitude/longitude coordinates are added to GPS logs in the future, upgrade the location proximity check from text matching to spatial distance calculations (using the Haversine formula).
  * **Machine Learning Fraud Detection:** Train classification models to identify suspicious refueling patterns, such as fuel card sharing or unusual fuel consumption rates.

---

## 3. Technology Selection Rationale

The technology choices are selected to meet security, accuracy, and operational requirements:

* **TypeScript:** Essential for maintaining clean data contracts. By defining canonical interfaces (`CanonicalTransaction`, `CanonicalInvoiceRow`), compile-time type checking prevents structural data bugs.
* **Decimal.js:** Required for mathematical integrity. Discrepancy checks must be mathematically exact to allow operators to claim billing rebates. Decimal.js avoids binary floating-point rounding errors.
* **Supabase Postgres + RLS:** Enables fast, secure multi-tenant isolation. RLS policies move security constraints to the database layer, protecting client data.
* **Next.js React Server Components (RSC):** Improves dashboard loading speeds by querying data on the server side, keeping client-side JavaScript bundles minimal.
