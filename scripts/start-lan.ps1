#Requires -Version 5.1
<#
.SYNOPSIS
  Start Fuel Assurance on all local interfaces (0.0.0.0:3993) for LAN access.

.DESCRIPTION
  Safely prepares port 3993, verifies dependencies, and starts the app in
  Development or Production mode. Only stops stale Fuel Assurance Node/Next.js
  processes; unrelated listeners are reported and left running.

.PARAMETER Mode
  Development (default) runs `npm run dev`.
  Production runs `npm run build` then `npm run start`.

.EXAMPLE
  .\scripts\start-lan.ps1 -Mode Development

.EXAMPLE
  .\scripts\start-lan.ps1 -Mode Production
#>
[CmdletBinding()]
param(
  [ValidateSet('Development', 'Production')]
  [string]$Mode = 'Development'
)

$ErrorActionPreference = 'Stop'
$Port = 3993
$ProjectRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path

function Write-Info([string]$Message) { Write-Host $Message -ForegroundColor Cyan }
function Write-Warn([string]$Message) { Write-Host $Message -ForegroundColor Yellow }
function Write-Err([string]$Message) { Write-Host $Message -ForegroundColor Red }

function Get-LanIPv4Addresses {
  Get-NetIPAddress -AddressFamily IPv4 -ErrorAction SilentlyContinue |
    Where-Object {
      $_.IPAddress -notlike '127.*' -and
      $_.IPAddress -notlike '169.254.*' -and
      $_.AddressState -eq 'Preferred' -and
      $_.InterfaceAlias -notlike 'vEthernet (WSL*' -and
      $_.InterfaceAlias -notlike '*Loopback*'
    } |
    Select-Object -ExpandProperty IPAddress
}

function Test-FuelAssuranceProcess([string]$CommandLine) {
  if ([string]::IsNullOrWhiteSpace($CommandLine)) { return $false }
  $normalized = $CommandLine.Replace('/', '\')
  return (
    $normalized -match [regex]::Escape($ProjectRoot) -or
    ($normalized -match 'Fuel Assurance' -and $normalized -match 'next')
  )
}

function Get-PortListener([int]$ListenPort) {
  Get-NetTCPConnection -LocalPort $ListenPort -State Listen -ErrorAction SilentlyContinue |
    Select-Object -First 1 LocalAddress, LocalPort, OwningProcess
}

function Stop-StaleFuelAssuranceListener([int]$ListenPort) {
  $listener = Get-PortListener -ListenPort $ListenPort
  if (-not $listener) { return $null }

  $process = Get-CimInstance Win32_Process -Filter "ProcessId=$($listener.OwningProcess)" -ErrorAction SilentlyContinue
  $cmd = if ($process) { $process.CommandLine } else { '' }

  if (Test-FuelAssuranceProcess $cmd) {
    Write-Warn "Stopping stale Fuel Assurance process on port $ListenPort (PID $($listener.OwningProcess))."
    Stop-Process -Id $listener.OwningProcess -Force -ErrorAction Stop
    Start-Sleep -Seconds 2
    return $listener.OwningProcess
  }

  throw "Port $ListenPort is in use by PID $($listener.OwningProcess) which does not belong to Fuel Assurance. Command: $cmd"
}

function Assert-Dependencies {
  if (-not (Test-Path (Join-Path $ProjectRoot 'package.json'))) {
    throw "package.json not found in $ProjectRoot"
  }
  if (-not (Test-Path (Join-Path $ProjectRoot 'node_modules'))) {
    throw "node_modules is missing. Run: npm ci"
  }
  if (-not (Test-Path (Join-Path $ProjectRoot 'node_modules\next\dist\bin\next'))) {
    throw "Next.js is not installed. Run: npm ci"
  }
}

Set-Location $ProjectRoot
Write-Info "Fuel Assurance project root: $ProjectRoot"

# Report legacy port 3339 conflicts without auto-stopping.
$legacy = Get-PortListener -ListenPort 3339
if ($legacy) {
  $legacyProc = Get-CimInstance Win32_Process -Filter "ProcessId=$($legacy.OwningProcess)" -ErrorAction SilentlyContinue
  if (Test-FuelAssuranceProcess $legacyProc.CommandLine) {
    Write-Warn "Fuel Assurance is still listening on legacy port 3339 (PID $($legacy.OwningProcess)). Stop it manually if no longer needed."
  } else {
    Write-Warn "Port 3339 is occupied by PID $($legacy.OwningProcess) (not Fuel Assurance)."
  }
}

$stoppedPid = Stop-StaleFuelAssuranceListener -ListenPort $Port
Assert-Dependencies

if ($Mode -eq 'Production') {
  Write-Info 'Building production bundle...'
  npm run build
  if ($LASTEXITCODE -ne 0) { throw 'npm run build failed.' }
  $startCommand = 'npm run start'
} else {
  $startCommand = 'npm run dev'
}

$lanAddresses = @(Get-LanIPv4Addresses)
$primaryLan = if ($lanAddresses.Count -gt 0) { $lanAddresses[0] } else { '<LAN-IP>' }

Write-Info "Starting Fuel Assurance ($Mode) on 0.0.0.0:$Port ..."
$server = Start-Process -FilePath 'npm.cmd' -ArgumentList (
  if ($Mode -eq 'Production') { 'run', 'start' } else { 'run', 'dev' }
) -WorkingDirectory $ProjectRoot -PassThru -NoNewWindow

Start-Sleep -Seconds 4
$listener = Get-PortListener -ListenPort $Port
if (-not $listener) {
  throw "Fuel Assurance did not bind to port $Port. Check the console output above."
}

if ($listener.LocalAddress -eq '127.0.0.1') {
  throw "Server is listening only on 127.0.0.1. Expected 0.0.0.0 or :: for LAN access."
}

Write-Host ''
Write-Host 'Fuel Assurance is running.' -ForegroundColor Green
Write-Host "  Local URL : http://localhost:$Port"
Write-Host "  LAN URL   : http://${primaryLan}:$Port"
Write-Host "  Listener  : $($listener.LocalAddress):$Port (PID $($listener.OwningProcess))"
if ($stoppedPid) { Write-Host "  Replaced stale PID: $stoppedPid" }
if ($lanAddresses.Count -gt 1) {
  Write-Host '  Additional LAN addresses:'
  $lanAddresses | Select-Object -Skip 1 | ForEach-Object { Write-Host "    http://${_}:$Port" }
}
Write-Host ''
Write-Host 'Press Ctrl+C in this window to stop the server.' -ForegroundColor DarkGray
Wait-Process -Id $server.Id