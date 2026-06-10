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

| URL | Purpose |
|-----|---------|
| `http://localhost:3993` | Local access on the host PC |
| `http://<HOST-PC-IP>:3993` | LAN access from another computer on the same private network |

Both `dev` and `start` bind to **0.0.0.0:3993** (all local interfaces). Command-line overrides still work, e.g. `npm run dev -- -p 4000`.

### LAN startup script

```powershell
.\scripts\start-lan.ps1 -Mode Development
.\scripts\start-lan.ps1 -Mode Production
```

The script:

1. Locates the project root from `scripts/`
2. Checks port 3993 and stops only stale Fuel Assurance Node/Next.js processes
3. Verifies `node_modules` exists
4. Builds first in Production mode
5. Prints local URL, LAN URL, IPv4 address, and listener PID

Administrator rights are **not** required to start the app.

### Find the host IPv4 address

```powershell
Get-NetIPAddress -AddressFamily IPv4 |
  Where-Object {
    $_.IPAddress -notlike '127.*' -and
    $_.AddressState -eq 'Preferred' -and
    $_.InterfaceAlias -notlike 'vEthernet (WSL*'
  } |
  Select-Object InterfaceAlias, IPAddress
```

Use the Ethernet/Wi-Fi address (e.g. `192.168.x.x`), not loopback or Hyper-V virtual adapters.

### Windows Firewall (Private network only)

Allow inbound TCP 3993 on the **Private** profile:

```powershell
New-NetFirewallRule `
  -DisplayName "Fuel Assurance Port 3993" `
  -Direction Inbound `
  -Protocol TCP `
  -LocalPort 3993 `
  -Action Allow `
  -Profile Private
```

Run in an elevated PowerShell if access is denied. Do **not** enable this rule on the Public profile. Do not open additional ports.

### Network profile

LAN access requires a trusted network. Confirm:

```powershell
Get-NetConnectionProfile | Select-Object InterfaceAlias, NetworkCategory
```

If the active adapter shows **Public**, switch it to Private before expecting LAN access:

```powershell
Set-NetConnectionProfile -InterfaceAlias "<YourAdapterName>" -NetworkCategory Private
```

Domain-joined PCs may show **DomainAuthenticated**. Ensure the firewall rule profile matches your active network, or ask IT before changing categories.

### Test from another PC

```powershell
Test-NetConnection <HOST-PC-IP> -Port 3993
```

Expected: `TcpTestSucceeded : True`

Then open `http://<HOST-PC-IP>:3993` in a browser. Confirm styled UI, navigation, and file-picker controls on DKV Check, AS24 Check, and GPS upload.

### Stop the server

Press **Ctrl+C** in the terminal running `npm run dev` / `npm run start`, or close the window started by `start-lan.ps1`.

### Port conflict diagnosis

```powershell
Get-NetTCPConnection -LocalPort 3993 -State Listen |
  Select-Object LocalAddress, LocalPort, OwningProcess
Get-CimInstance Win32_Process -Filter "ProcessId=<PID>" |
  Select-Object ProcessId, CommandLine
```

If the command line references `C:\Fuel Assurance` and `next`, it is safe to stop that PID. Otherwise resolve the conflict manually — `start-lan.ps1` will not kill unrelated processes.

### DHCP reservation (recommended)

The LAN IP can change after reboot unless the router reserves one. Note the host IPv4 and adapter MAC:

```powershell
Get-NetAdapter | Where-Object Status -eq 'Up' |
  Select-Object Name, MacAddress
```

Configure a DHCP reservation in the router admin UI (steps vary by model). A fixed address has **not** been configured automatically by this project.

### Security limitations

- HTTP traffic on the LAN is **not encrypted**.
- Anyone on the permitted LAN can reach the app unless application authentication blocks them.
- Do **not** use router port-forwarding, ngrok, cloudflared, or other public tunnels for this port.
- Keep the firewall rule **Private-profile only**.
- Use only on a trusted company network with sensitive invoice/GPS data.
- External access requires a proper authenticated HTTPS deployment.

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