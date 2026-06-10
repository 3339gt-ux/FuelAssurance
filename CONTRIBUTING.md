# Contributing to Fuel Assurance

## Repository hygiene

Do **not** commit:

- Real AS24 PDFs, DKV exports, or GPS files
- `local_db.json`, SQLite databases with customer data
- `private-uploads/`, `uploads/`, `data/`
- `.env`, `.env.local`, API keys, or service-role keys
- Screenshots containing customer registrations or amounts

Use anonymised fixtures under `tests/fixtures/` for automated tests.

## Development setup

```powershell
cd "C:\Fuel Assurance"
npm install
cp .env.local.example .env.local
npm run dev
```

Application URL: `http://localhost:3993`

## Branch workflow

1. Branch from the latest implementation branch or `main`.
2. Make focused commits (`feat:`, `fix:`, `test:`, `docs:`).
3. Run `npm run type-check`, `npm run lint`, `npm run test`, `npm run build`.
4. For browser workflows: `NEXT_PUBLIC_E2E_HOOKS=true npm run test:e2e` (requires local Sample Files).
5. Push and open a pull request — **no force push** to shared history.

## Adding a new provider format

1. Add column aliases in `src/domain/parsers/core/column-aliases.ts`.
2. Implement parser under `src/domain/parsers/`.
3. Extend `src/lib/source-detection.ts` with structure markers.
4. Add unit tests with synthetic fixtures.
5. Document rules in `docs/PARSER_RULES.md` and `docs/DATA_SOURCES.md`.

## Agent handover

See `docs/AGENT_HANDOVER.md` for parser versions, batch schema, and open work items.