# Agent Handover

**Branch:** `grok/fuel-assurance-three-source-multi-gps`  
**Remote:** `https://github.com/3339gt-ux/FuelAssurance.git`  
**Port:** 3993

## What works

- Three transaction sources through `/api/upload` with structure-based detection
- Persistent transaction batches (`src/lib/transaction-batch-service.ts`)
- Multi-GPS attach on `/batches` and `/api/batches/{id}/upload-gps`
- AS24 coordinate parser with registration and payment-currency accuracy fixes
- DKV daily (12/21 col) and invoice-period (40 col) parsers
- Simple Mode navigation (5 items)
- Parse cache by file hash + parser version
- Vitest + Playwright (local Sample Files)

## Key files

| Area | Path |
|------|------|
| Source detection | `src/lib/source-detection.ts` |
| Upload API | `src/app/api/upload/route.ts` |
| Batch service | `src/lib/transaction-batch-service.ts` |
| AS24 parser | `src/domain/parsers/as24/as24-pdf-parser.ts` |
| DKV daily | `src/domain/parsers/dkv/dkv-transaction-parser.ts` |
| DKV invoice | `src/domain/parsers/dkv/dkv-invoice-parser.ts` |
| GPS parser | `src/domain/parsers/gps/gps-parser.ts` |
| Local DB | `src/lib/db.ts` |

## Batch schema

See `src/types/transaction-batch.ts` — includes `sourceType`, `storedFileReference`, summaries, `vehicleCheckStatuses`, `verificationResults`, `processingStatus`.

## Open / partial work

- Compact transaction table and sticky top controls (AS24 page has compact fleet table)
- Comfortable vs compact density toggle across all check pages
- Full Supabase migration (SQL migrations exist; Simple Mode uses JSON)
- CI browser tests with headless PDF fixtures
- Pull request merge to default branch (push feature branch only unless instructed)

## Do not

- Force-push GitHub remote
- Commit `local_db.json`, Sample Files, or `private-uploads/`
- Run `create-next-app` or replace working parsers without cause
- Use mileage as litres or station currency as primary payment display for AS24

## Startup for next agent

```powershell
cd "C:\Fuel Assurance"
git fetch origin
git checkout grok/fuel-assurance-three-source-multi-gps
npm install
npm run dev
```