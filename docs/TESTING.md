# Testing

## Commands

```powershell
npm run type-check
npm run lint
npm run test
npm run build
NEXT_PUBLIC_E2E_HOOKS=true npm run test:e2e
```

## Unit tests (Vitest)

- Parsers: AS24, DKV daily, DKV invoice, GPS, stations
- Source detection: `tests/unit/source-detection.test.ts`
- Fleet registry, fuel calculations, acceptance domain tests

Synthetic fixtures: `tests/fixtures/synthetic-*.xlsx` (committed, anonymised).

Legacy parser tests may also read `Sample Files/` when present locally (gitignored).

## Browser / E2E (Playwright)

- Config: `playwright.config.ts` — port 3993, `reuseExistingServer: false`
- Spec: `tests/e2e/simple-mode.spec.ts`
- Requires local Sample Files (`document_direct.pdf`, DKV xlsx) and `NEXT_PUBLIC_E2E_HOOKS=true`
- **Excluded from GitHub Actions CI** (no real samples in repo; long PDF parse)

## CI (GitHub Actions)

On push/PR: install, type-check, lint, vitest, build.

CI uses committed synthetic fixtures only. These suites are excluded from default `npm run test`:

- `tests/seed.test.ts` — seeds `local_db.json` from real Sample Files
- `tests/acceptance/domain.test.ts` — full integration against real Sample Files

Run locally with Sample Files present:

```powershell
npm run test:local
```

## Acceptance evidence

Browser acceptance must use the real UI on port 3993 — not seeded DB rows alone.