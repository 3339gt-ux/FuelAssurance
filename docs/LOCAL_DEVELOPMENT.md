# Local Development

## Requirements

- Node.js 20+
- npm 9+
- Windows path: `C:\Fuel Assurance`

## Install and run

```powershell
cd "C:\Fuel Assurance"
npm install
copy .env.local.example .env.local
npm run dev
```

URL: **http://localhost:3993**

Both `dev` and `start` scripts bind to port 3993.

## Persistence

| Path | Purpose |
|------|---------|
| `local_db.json` | All tables including `transaction_batches` |
| `private-uploads/` | Stored source file copies |
| `.next/` | Next.js build cache — run `npm run clean` if stale |

## Environment

See `.env.example`. Supabase variables are optional for Simple Mode; the app runs with the local JSON database.

Set `NEXT_PUBLIC_E2E_HOOKS=true` when running Playwright E2E tests.

## Simple Mode routes

- `/` — Home
- `/dkv-check` — DKV daily + invoice-period upload
- `/as24-check` — AS24 PDF upload
- `/previous-results` — Completed checks
- `/settings` — Theme and preferences
- `/batches` — Transaction batch workspace (multi-GPS; not in simple nav)

## Troubleshooting

- **Stale UI after build**: `npm run clean:dev`
- **Upload spinner stuck**: check `/api/upload` response in Network tab
- **Port in use**: ensure only one process on 3993