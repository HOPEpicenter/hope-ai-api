[CmdletBinding()]
param()

$ErrorActionPreference = "Stop"

$repoRoot = Split-Path -Parent $PSScriptRoot
$srcRoot  = Join-Path $repoRoot "src"

# Run BOM guard first (fast fail if package.json has UTF-8 BOM)
$bomGuard = Join-Path $PSScriptRoot "guard-no-bom.ps1"
if (Test-Path $bomGuard) {
  & pwsh -NoProfile -ExecutionPolicy Bypass -File $bomGuard
} else {
  Write-Host ("WARN: BOM guard not found at: {0}" -f $bomGuard) -ForegroundColor Yellow
}

if (-not (Test-Path $srcRoot)) {
  throw "src folder not found at: $srcRoot"
}

$files = Get-ChildItem -Path $srcRoot -Recurse -File -Include *.ts,*.tsx -ErrorAction Stop

$hits = $files | ForEach-Object {
  Select-String -Path $_.FullName -Pattern "@azure/functions" -SimpleMatch -ErrorAction SilentlyContinue
} | Where-Object { $_ -ne $null }

if ($hits) {
  Write-Host ""
  Write-Host "ERROR: Found '@azure/functions' imports under src. Express-only build must not reference Azure Functions." -ForegroundColor Red
  $hits | ForEach-Object {
    Write-Host (" - {0}:{1} {2}" -f $_.Path, $_.LineNumber, $_.Line.Trim()) -ForegroundColor Red
  }
  throw "Guard failed: '@azure/functions' import(s) found in src."
}

Write-Host "OK: Guard passed (no '@azure/functions' imports under src)."

