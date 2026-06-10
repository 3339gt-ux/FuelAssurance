# Fuel Assurance

Fuel Assurance is a local-first fuel card reconciliation and telematics validation application. It ingests AS24 PDF invoices, DKV daily/authorisation reports, DKV invoice-period transaction reports, and GPS telematics files, then cross-checks charges against vehicle evidence.

**Simple Mode** (default navigation): Home, DKV Check, AS24 Check, Previous Results, Settings.

Advanced operational modules remain in the codebase but are hidden from the default sidebar.

## Quick start

```powershell
cd "C:\Fuel Assurance"
npm install
npm run dev
```

Open [http://localhost:3993](http://localhost:3993).

## LAN access (private network only)

Fuel Assurance listens on **all local interfaces** at port **3993** so colleagues on the same trusted private network can open:

`http://<HOST-PC-IP>:3993`

Find the host IPv4 address in PowerShell:

```powershell
Get-NetIPAddress -AddressFamily IPv4 |
  Where-Object { $_.IPAddress -notlike '127.*' -and $_.AddressState -eq 'Preferred' } |
  Select-Object InterfaceAlias, IPAddress
```

Convenient startup script:

```powershell
.\scripts\start-lan.ps1 -Mode Development
# or
.\scripts\start-lan.ps1 -Mode Production
```

**Requirements**

- Windows network profile must be **Private** (or domain-managed equivalent) — not Public.
- A Windows Defender Firewall inbound rule named **Fuel Assurance Port 3993** must allow TCP **3993** on the **Private** profile only.
- The host PC must stay powered on and awake.
- Do **not** expose port 3993 to the public internet or router port-forwarding.

LAN access uses ordinary HTTP. Browsers will show **Not secure** — this is expected on a private network. Traffic is not encrypted unless you deploy behind HTTPS separately.

The LAN IP may change when DHCP renews unless the router has a DHCP reservation for the host PC.

## Scripts

| Command | Purpose |
|---------|---------|
| `npm run dev` | Development server on **0.0.0.0:3993** (localhost + LAN) |
| `npm run start` | Production server on **0.0.0.0:3993** (localhost + LAN) |
| `.\scripts\start-lan.ps1` | Safe LAN startup with URL summary |
| `npm run build` | Production build |
| `npm run type-check` | TypeScript validation |
| `npm run lint` | ESLint |
| `npm run test` | Vitest unit/integration tests |
| `npm run test:e2e` | Playwright browser tests (local Sample Files) |
| `npm run clean:dev` | Clear `.next` cache and restart dev |

## Workflow

1. Upload a transaction source (AS24 PDF or DKV file) once.
2. Review extracted fleet vehicles and transactions.
3. Attach one or many GPS files to the saved **Transaction Batch**.
4. Return later to attach more GPS files — no re-upload of the invoice/report required.
5. Review verification results and export from Previous Results.

## Persistence

Local development uses `local_db.json` (gitignored). Transaction batches, import rows, and GPS attachments survive restarts. Source files are stored under `private-uploads/` (gitignored).

## Documentation

- [Project overview](docs/PROJECT_OVERVIEW.md)
- [Architecture](docs/ARCHITECTURE.md)
- [Data sources](docs/DATA_SOURCES.md)
- [Parser rules](docs/PARSER_RULES.md)
- [Local development](docs/LOCAL_DEVELOPMENT.md)
- [Testing](docs/TESTING.md)
- [Agent handover](docs/AGENT_HANDOVER.md)
- [Known limitations](docs/KNOWN_LIMITATIONS.md)

## Current branch

Implementation branch: `grok/fuel-assurance-three-source-multi-gps`

## Security

Never commit real customer files, `local_db.json`, `.env`, or `private-uploads/`. See [CONTRIBUTING.md](CONTRIBUTING.md).