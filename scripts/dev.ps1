param(
  [Parameter(Position=0)]
  [ValidateSet("help","pull","smoke","verify")]
  [string]$Cmd = "help",

  [switch]$FreshAzurite
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

function Exec {
  param([Parameter(Mandatory=$true)][string]$Command)
  Write-Host ">> $Command" -ForegroundColor Cyan
  & pwsh -NoProfile -Command $Command
  if ($LASTEXITCODE -ne 0) { throw "Command failed (exit=$LASTEXITCODE): $Command" }
}

function Show-Help {
  @"
scripts/dev.ps1

Usage:
  pwsh -NoProfile -ExecutionPolicy Bypass -File .\scripts\dev.ps1 help
  pwsh -NoProfile -ExecutionPolicy Bypass -File .\scripts\dev.ps1 pull
  pwsh -NoProfile -ExecutionPolicy Bypass -File .\scripts\dev.ps1 smoke [-FreshAzurite]
  pwsh -NoProfile -ExecutionPolicy Bypass -File .\scripts\dev.ps1 verify [-FreshAzurite]

Commands:
  pull    - Safe fast-forward pull (auto-stash tracked changes)
  smoke   - Run local smoke (optionally with fresh Azurite)
  verify  - pull + smoke

Examples:
  .\scripts\dev.ps1 verify -FreshAzurite
"@ | Write-Host
}

$repoRoot = (& git rev-parse --show-toplevel 2>$null)
if (-not $repoRoot) { throw "Not in a git repo." }

switch ($Cmd) {
  "help"   { Show-Help; break }

  "pull"   {
    Exec "pwsh -NoProfile -ExecutionPolicy Bypass -File .\scripts\git-safe-pull.ps1"
    break
  }

  "smoke"  {
    if ($FreshAzurite) { $env:OPS_AZURITE_FRESH = "1" }
    Exec "pwsh -NoProfile -ExecutionPolicy Bypass -File .\scripts\run-smoke.ps1"
    break
  }

  "verify" {
    Exec "pwsh -NoProfile -ExecutionPolicy Bypass -File .\scripts\git-safe-pull.ps1"
    if ($FreshAzurite) { $env:OPS_AZURITE_FRESH = "1" }
    Exec "pwsh -NoProfile -ExecutionPolicy Bypass -File .\scripts\run-smoke.ps1"
    break
  }
}
