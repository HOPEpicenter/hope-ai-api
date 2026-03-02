param(
  [Parameter(Position=0)]
  [ValidateSet("help","pull","smoke","verify","status","bootstrap")]
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
  bootstrap - Install deps + ensure .env + show status
  status    - Show branch/dirty/ahead-behind/env snapshot
  pull      - Safe fast-forward pull (auto-stash tracked changes)
  smoke     - Run local smoke (optionally with fresh Azurite)
  verify    - pull + smoke

Examples:
  .\scripts\dev.ps1 verify -FreshAzurite
"@ | Write-Host
}

$repoRoot = (& git rev-parse --show-toplevel 2>$null)
if (-not $repoRoot) { throw "Not in a git repo." }

# If user runs 'pull' with staged changes, warn (stash/pop can be confusing)
$staged = & git diff --name-only --cached
if ($Cmd -eq "pull" -and ($staged | Measure-Object).Count -gt 0) {
  Write-Host "WARNING: You have staged changes. 'pull' may stash/unstash unexpectedly. Consider committing first." -ForegroundColor Yellow
}

switch ($Cmd) {
  "help"   { Show-Help; break }

  "status" {

    $branch = (& git branch --show-current)
    $staged = @(& git diff --name-only --cached)
    $unstaged = @(& git diff --name-only)

    # ahead/behind vs origin/main (handles detached/other remotes gracefully)
    & git fetch origin --prune | Out-Null
    $aheadBehind = (& git rev-list --left-right --count origin/main...HEAD 2>$null)
    $ahead = $null; $behind = $null
    if ($aheadBehind) {
      $parts = ($aheadBehind -split "\s+")
      if ($parts.Length -ge 2) { $behind = $parts[0]; $ahead = $parts[1] }
    }

    Write-Host "=== dev status ===" -ForegroundColor Cyan
    Write-Host ("branch            : {0}" -f $branch)
    Write-Host ("staged files      : {0}" -f $staged.Count)
    Write-Host ("unstaged files    : {0}" -f $unstaged.Count)
    if ($behind -ne $null -and $ahead -ne $null) {
      Write-Host ("origin/main behind: {0}" -f $behind)
      Write-Host ("origin/main ahead : {0}" -f $ahead)
    } else {
      Write-Host "origin/main ahead/behind: (unknown)" -ForegroundColor Yellow
    }

    $fresh = [Environment]::GetEnvironmentVariable("OPS_AZURITE_FRESH")
    Write-Host ("OPS_AZURITE_FRESH  : {0}" -f ($(if ($fresh) { $fresh } else { "(not set)" })))

    if ($staged.Count -gt 0) { Write-Host "WARNING: staged changes present" -ForegroundColor Yellow }
    if ($unstaged.Count -gt 0) { Write-Host "WARNING: unstaged changes present" -ForegroundColor Yellow }
    if ($behind -ne $null -and [int]$behind -gt 0) { Write-Host "WARNING: branch behind origin/main (run: .\scripts\dev.ps1 pull)" -ForegroundColor Yellow }

    break
  }

  "bootstrap" {
    Write-Host "=== dev bootstrap ===" -ForegroundColor Cyan

    # Check node
    $node = (& node --version 2>$null)
    if (-not $node) { throw "Node.js not found in PATH." }
    Write-Host ("node version : {0}" -f $node)

    # Check npm
    $npm = (& npm --version 2>$null)
    if (-not $npm) { throw "npm not found in PATH." }
    Write-Host ("npm version  : {0}" -f $npm)

    # Install deps
    Write-Host "Running: npm ci" -ForegroundColor Cyan
    & npm ci
    if ($LASTEXITCODE -ne 0) { throw "npm ci failed." }

    # Ensure .env
    if (-not (Test-Path ".\.env")) {
      if (Test-Path ".\.env.example") {
        Copy-Item ".\.env.example" ".\.env"
        Write-Host ".env created from .env.example" -ForegroundColor Yellow
      } else {
        Write-Host "WARNING: .env not found and .env.example missing." -ForegroundColor Yellow
      }
    } else {
      Write-Host ".env present."
    }

    # Show status snapshot
    Write-Host ""
    & pwsh -NoProfile -ExecutionPolicy Bypass -File .\scripts\dev.ps1 status

    break
  }
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





