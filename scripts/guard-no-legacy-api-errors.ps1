# scripts/guard-no-legacy-api-errors.ps1
# Guard ONLY for legacy error helpers inside ops routing code.
# Avoid false positives in shared http/apiError helpers or repositories.

[CmdletBinding()]
param()

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$ScriptDir = $PSScriptRoot
if (-not $ScriptDir -or $ScriptDir.Trim().Length -eq 0) { $ScriptDir = (Get-Location).Path }

$repoRoot = Split-Path -Parent $ScriptDir
$routesRoot = Join-Path $repoRoot "src\routes"

if (-not (Test-Path $routesRoot)) {
  Write-Host ("WARN: routes folder not found at: {0} (skipping legacy error guard)" -f $routesRoot) -ForegroundColor Yellow
  exit 0
}

$files = Get-ChildItem -Path $routesRoot -Recurse -File -Include *.ts,*.tsx -ErrorAction Stop

# These are the *actual* legacy shapes we want to kill in router code
$patterns = @(
  'error:\s*"visitor_not_found"',
  'function\s+notFound\(',
  'function\s+badRequest\('
)

$hits = @()
foreach ($f in $files) {
  foreach ($p in $patterns) {
    $m = Select-String -Path $f.FullName -Pattern $p -ErrorAction SilentlyContinue
    if ($m) { $hits += $m }
  }
}

if ($hits.Count -gt 0) {
  Write-Host ""
  Write-Host "ERROR: Found legacy API error helpers/shapes in route code. Use ApiError + throw badRequest()/notFound() and errorMiddleware." -ForegroundColor Red
  $hits | Select-Object -First 120 | ForEach-Object {
    Write-Host (" - {0}:{1} {2}" -f $_.Path, $_.LineNumber, $_.Line.Trim()) -ForegroundColor Red
  }
  throw "Guard failed: legacy API error patterns found in routes."
}

Write-Host "OK: Guard passed (no legacy API error helpers/shapes in routes)." -ForegroundColor Green
