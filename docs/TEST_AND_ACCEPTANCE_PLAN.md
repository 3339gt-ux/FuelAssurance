# Testing and Acceptance Plan

This document details the test categories, verification suites, and acceptance criteria used to validate the Fuel Assurance system. It outlines how each domain module is tested and establishes compliance baselines for DKV, AS24, and GPS data imports.

---

## 1. Testing Framework and Strategy

The system uses **Vitest** for unit and integration testing. Tests are designed to run in automated CI/CD pipelines to prevent regressions across parsers, matching logic, and financial validation.

```
                           Vitest Testing Pipeline
                                      │
         ┌────────────────────────────┼────────────────────────────┐
         ▼                            ▼                            ▼
   Unit Testing              Integration Testing             Security Testing
  (Parser Regex,              (9-Stage matching,           (RLS isolation, SQL
  Decimal Math Checks)        Telematics pings)            injection verification)
         │                            │                            │
         └────────────────────────────┼────────────────────────────┘
                                      ▼
                      Sample File Acceptance Testing
                     (Compare imports against expected
                      reconciliation results)
```

---

## 2. Test Categories and Descriptions

### I. Ingestion, Schema Discovery & Drift Testing
* **Focus:** Discovered column mapping, template detection, header row identification, and structural changes.
* **Test Scenarios:**
  * **Header Row Identification:** Verify that `detectHeaderRow` correctly locates headers despite leading empty lines.
  * **Fuzzy Alias Resolution:** Test that variations (e.g. `Registration Number`, `License Plate`, `Reg`) map to the canonical `licencePlate` field.
  * **DKV Variant Detection:** Test that DKV files are correctly classified as either Variant 1 (12 columns) or Variant 2 (21 columns).
  * **Drift Severity Classification:** Verify that adding columns returns a `MINOR` drift classification, while removing required columns triggers a `BREAKING` drift classification.

### II. Identity Alias Resolution Testing
* **Focus:** Date-aware resolution of vehicle registration plates and card numbers.
* **Test Scenarios:**
  * **Registration Mapping:** Test that a registration maps to the correct primary vehicle ID when resolved on a date within an alias window.
  * **Active Plate Lookup:** Verify that `getRegistrationAtDate` returns the active registration plate for a vehicle at any given historical point.
  * **Card Transfer Verification:** Verify that card numbers resolve to different vehicles depending on the transaction timestamp, matching card transfer alias records.

### III. Reconciliation Engine Testing
* **Focus:** 9-stage matching pipeline, one-to-one constraints, duplicate identification, and quantity tolerances.
* **Test Scenarios:**
  * **Stage Priority Order:** Verify that Stage 1 matches are locked first, preventing downstream stage matchers from accessing the matched records.
  * **One-to-One Lock:** Test that a single transaction cannot map to multiple invoice rows, even if they share identical quantities and timestamps.
  * **Fuel Quantity Tolerance:** Test that fuel transactions within the ±0.02L tolerance are successfully matched, while variances exceeding ±0.02L are flagged.
  * **Non-Fuel Mismatch:** Verify that non-fuel transactions (e.g., tolls, parking) require an exact quantity match, bypassing the ±0.02L tolerance check.

### IV. Financial Validation Testing
* **Focus:** Decimal.js precision math, VAT verifications, rebates, and fee tolerances.
* **Test Scenarios:**
  * **Binary Precision Safety:** Verify that values like `0.1` and `0.2` do not generate rounding errors, matching exactly.
  * **Variance Flagging:** Test that invoice base net values exceeding tolerance configurations trigger a variance flag.
  * **Negative Discount Math:** Verify that negative discount values (e.g. `-10.50` DKV rebates) are converted to absolute values for comparison.

### V. Telematics Scoring Testing
* **Focus:** Confidence scoring weights, classifications, and text-based location proximity matching.
* **Test Scenarios:**
  * **Weighted Calculations:** Verify that a match passing all checks returns a score of 100, while a match missing all checks returns 0.
  * **Text Location Multipliers:** Test that location score multipliers scale based on character overlap ratios between station cities and GPS addresses.
  * **Tank Capacity Checks:** Verify that fuel transactions exceeding the vehicle's capacity (e.g. pumping 1,500L into a 1,200L tank) fail the volume check.
  * **Product Exclusions:** Verify that AdBlue and toll transactions automatically skip fuel level checks, scaling the final score using remaining parameters.

### VI. Reasoning Ledger Testing
* **Focus:** Auditable JSON entries, evidence compilation, and manual decision overrides.
* **Test Scenarios:**
  * **Audit Log Generation:** Verify that ledger logs record the exact configuration parameters used during scoring.
  * **Evidence Allocation:** Confirm that matching GPS logs are correctly placed in the `supportingEvidence` array.
  * **Manual Override Integrity:** Verify that manually overriding a status writes a `ReviewDecision` block, leaving the machine's original score unchanged.

### VII. Reporting Security Testing
* **Focus:** Export sanitisation and formula injection prevention.
* **Test Scenarios:**
  * **Formula Sanitisation:** Verify that strings starting with `=`, `+`, `-`, or `@` are prefixed with `'` during CSV and Excel exports.

### VIII. Security & Multi-Tenant Testing
* **Focus:** Tenant isolation and database RLS policies.
* **Test Scenarios:**
  * **RLS Isolation:** Verify that database SELECT queries fail when using a JWT token from another tenant.
  * **Signed URLs:** Verify that file storage access fails when using expired URL signatures.

---

## 3. Sample File Ingestion Acceptance Criteria

To pass system verification, the parser must ingest the provided sample files and meet these criteria:

### DKV Transaction & Invoice Files (`Invoice-Transactions.xlsx` & `Ola.xlsx`)
* **Acceptance Benchmarks:**
  * Detect DKV column mappings, including variant structures.
  * Convert Excel serial dates to ISO-8601 UTC.
  * Clean station codes by stripping the `SS` prefix and leading zeroes.
  * Validate net base calculations against quantity and unit price.

### AS24 PDF Invoice Statements (`document_direct.pdf`)
* **Acceptance Benchmarks:**
  * Parse control totals matching invoice number `5500PRF001465`, contract number `609851`, and gross total `40154.47` HUF.
  * Split concatenated strings (e.g. `241 MH 236261000`) into Registration `241MH236` and Odometer `261000`.
  * Parse all cards filling detail lines and PASSango toll records.
  * Reconcile card totals against the invoice summary table.

### GPS Telematics Files (`GPS.xlsx`)
* **Acceptance Benchmarks:**
  * Parse vehicle registration numbers, speeds, and fuel levels.
  * Extract text address coordinates, leaving latitude/longitude values as `null`.
  * Parse Excel timestamps.
