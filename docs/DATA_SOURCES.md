# Data Sources

## Supported transaction sources

| Source type | Formats | Parser |
|-------------|---------|--------|
| AS24 Invoice PDF | PDF (text-based) | `as24-pdf-parser.ts` |
| DKV Daily Transactions | XLS, XLSX, CSV | `dkv-transaction-parser.ts` |
| DKV Invoice-Period Transactions | XLS, XLSX | `dkv-invoice-parser.ts` |
| GPS / Telematics | XLS, XLSX | `gps-parser.ts` |

## Detection

Files are classified by **headings and structure**, not filename alone (`src/lib/source-detection.ts`).

- **AS24**: PDF text markers (Cards Filling, PASSango, statement fields).
- **DKV daily**: Authorisation time, response, licence plate (~12–21 columns).
- **DKV invoice-period**: Invoice number, Base Value Net, Value of purchase net (~30–40 columns).
- **GPS**: Vehicle, fuel level, odometer/KM columns.

When confidence is low, the UI asks the user to confirm before parsing.

## Transaction batches

Each AS24 or DKV upload creates one persistent batch (`transaction_batches` in `local_db.json`):

- Parsed once per `fileHash + parserVersion`
- Reopened without re-parsing on navigation
- GPS files attached incrementally via `/api/batches/{id}/upload-gps`

## Stored files

Original uploads are copied to `private-uploads/` (gitignored). The batch record stores `storedFileReference`.

## Customer data

Real source files must remain local. Committed tests use `tests/fixtures/synthetic-*.xlsx` only.