# System Architecture

The Fuel Assurance system is built as a modern, high-performance web application utilizing a robust tech stack, structured with a domain-driven layout, and designed with a strict layer isolation pattern to ensure data consistency, audibility, and maintainability.

---

## 1. Technical Stack Rationale

The platform's technical stack is chosen for its type-safety, rapid interface building, database flexibility, and enterprise-grade security features.

```
┌────────────────────────────────────────────────────────────────────────┐
│                          Next.js App Router                            │
│        (Frontend UI Dashboard, API Route Handlers, SSR/CSR Pages)      │
├───────────────────────────────────┬────────────────────────────────────┤
│           TypeScript              │            Tailwind CSS            │
│  (Compile-time type assurance)    │  (Utility-first responsive layout) │
├───────────────────────────────────┴────────────────────────────────────┤
│                           Supabase Backend                             │
│     (PostgreSQL Database, Gotrue Auth, Storage Buckets, RLS Policies)  │
└────────────────────────────────────────────────────────────────────────┘
```

* **Next.js App Router (React Framework):** Used as the core application framework. The App Router allows for server-side rendering (SSR) for fast dashboard loads, client-side React components (CSR) for interactive lists and filters, and built-in API route handlers for secure file uploads and database operations.
* **TypeScript:** Ensures absolute correctness of type contracts across all domain modules. Fuel transactions, invoices, and GPS points have complex schemas; TypeScript eliminates data shape mismatches at compile time.
* **Tailwind CSS:** Provides the utility-first CSS framework needed to construct a dense, data-rich user interface that remains responsive across devices.
* **Supabase (PostgreSQL + Auth + Storage + RLS):** 
  * **PostgreSQL:** Provides a relational store to represent relationships between vehicles, cards, transactions, and invoice rows.
  * **Row-Level Security (RLS):** Policies are bound to user session JWTs, ensuring that users can only see records belonging to their registered organization.
  * **Storage Buckets:** Stores uploaded spreadsheets and PDFs in secure, private buckets accessed via time-limited signed URLs.

---

## 2. Directory Structure & Code Layout

The project follows a modular, domain-driven structure. Core business logic is isolated in a standalone `domain/` directory, keeping it completely separate from Next.js routing concerns and component rendering.

```
c:\Fuel Assurance\
├── db/                       # Database migrations and seed files
│   └── migrations/           # SQL migration scripts (001 to 008)
├── docs/                     # Comprehensive system documentation
├── public/                   # Static assets (icons, images)
├── src/
│   ├── app/                  # Next.js App Router structure
│   │   ├── (dashboard)/      # Authenticated layout and pages
│   │   │   ├── audit/        # System audit logs page
│   │   │   ├── cards/        # Fuel card registry and aliases
│   │   │   ├── dashboard/    # Primary analytics page
│   │   │   ├── imports/      # File import history page
│   │   │   ├── mapping-queue/# Identity mapping queue
│   │   │   └── ...           # Additional pages (reconciliation, reports, etc.)
│   │   ├── globals.css       # Tailwind global stylesheets
│   │   ├── layout.tsx        # Base root layout
│   │   └── page.tsx          # Login and landing router
│   ├── components/           # Reusable UI components
│   │   ├── ui/               # Base UI elements (buttons, tables, inputs)
│   │   └── layout/           # Sidebar, header, navigation controls
│   ├── domain/               # Decoupled business logic (No Next.js dependencies)
│   │   ├── financial/        # Financial math and invoice validation
│   │   ├── identities/       # Vehicle, card, OBU alias and mapping structures
│   │   ├── normalisation/    # Normalisation logic mapping raw to canonical
│   │   ├── parsers/          # Extraction layer (AS24 PDF, DKV, GPS, Stations)
│   │   ├── reasoning/        # Auditable Reasoning Ledger structures
│   │   ├── reconciliation/   # Stage-based matching and period alignment
│   │   ├── telematics/       # Time, location, fuel scoring and sessions
│   │   └── types.ts          # Master file containing all domain type interfaces
│   └── lib/                  # Shared utilities (currency, dates, hashes)
└── tests/                    # Vitest unit and integration test suites
```

---

## 3. Separation of Concerns & Domain Modules

The business logic resides in `src/domain/` and is divided into cohesive sub-domains:

1. **Parser Layer (`src/domain/parsers/`):** Consists of single-purpose functions that take raw bytes, worksheets, or text and emit structured data objects representing the raw input file columns.
2. **Normalisation Layer (`src/domain/normalisation/`):** Acts as the bridge between parsers and core engines. It transforms raw parser outputs (which reflect provider-specific quirks) into uniform, strongly-typed interfaces defined in `types.ts` (`CanonicalTransaction`, `CanonicalInvoiceRow`, etc.).
3. **Reconciliation Module (`src/domain/reconciliation/`):** Responsible for executing multi-stage matching policies. It determines links between canonical transactions and canonical invoice rows, implementing one-to-one protections and date-overlap analysis.
4. **Financial Validation Module (`src/domain/financial/`):** Focuses on math validation. It evaluates whether invoiced net, gross, VAT, discounts, and fee sums match the calculated expected values, reporting any discrepancies using Decimal.js.
5. **Telematics Module (`src/domain/telematics/`):** Scores transaction validity by querying nearby GPS telemetry points, running calculations on time differences, location matches, fuel tank changes, stop-engine activities, and odometer variations.
6. **Reasoning Ledger Module (`src/domain/reasoning/`):** Collates results from reconciliation, financial checks, and telematics scoring into an audit-friendly record. It handles the application of manual overrides without deleting the underlying machine data.

---

## 4. Parser Layer Isolation

A key architectural pattern is the complete isolation of the parser layer. Parsers must remain dumb; they are not allowed to make database calls, normalize codes, resolve aliases, or make business decisions.

```
┌─────────────────┐     ┌──────────────┐     ┌─────────────────────┐
│  Raw Excel/PDF  │ ──> │ Raw Parsers  │ ──> │ Raw Parser Objects  │
└─────────────────┘     └──────────────┘     └─────────────────────┘
                                                        │
                                                        ▼
┌─────────────────┐     ┌──────────────┐     ┌─────────────────────┐
│ Canonical Types │ <── │ Normaliser   │ <── │ Helpers / Utilities │
└─────────────────┘     └──────────────┘     └─────────────────────┘
```

### Purpose of Isolation
* **Provider Independence:** If DKV changes its column headers or AS24 updates its invoice PDF design, only the respective parser profile is affected. The normalisation layer and downstream matching engines remain untouched.
* **Traceability:** Keeping raw parsed records separate from normalized records allows the system to store the exact raw data in the database. If a reconciliation failure occurs, auditors can review the exact original values that caused the issue, alongside the normalized model.
* **Testability:** Isolating parsers allows them to be unit tested in isolation using mock arrays or text strings without requiring database connections, web requests, or complex domain setups.
* **Pipeline Safety:** The normalisation layer cleans the data, handles timezone offsets, and handles Excel date formatting bugs, providing a clean API contract for downstream calculations.
