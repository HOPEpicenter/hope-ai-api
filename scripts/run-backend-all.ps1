param(
  [string]$BaseUrl = "http://127.0.0.1:3000/api"
)

$ErrorActionPreference = "Stop"

Write-Host "=== BACKEND FULL REGRESSION ===" -ForegroundColor Cyan
Write-Host "BaseUrl: $BaseUrl"
Write-Host ""

# ---- REQUIRED ENV ----
if ([string]::IsNullOrWhiteSpace($env:HOPE_API_KEY)) {
  throw "HOPE_API_KEY is required to run full regression."
}

# ---- FULL BACKEND REGRESSION ----
# This path owns local backend startup. Do not call Express smoke here because
# ci-smoke-express.ps1 assumes an Express server is already running.
$env:HOPE_RUN_PHASE3_ASSERTS = "1"
$env:HOPE_RUN_PHASE4_ASSERTS = "1"

Write-Host "Phase 3 + Phase 4 asserts ENABLED" -ForegroundColor Yellow
Write-Host ""
Write-Host "=== STEP 1: Full Backend Regression ==="
pwsh -NoProfile -ExecutionPolicy Bypass -File (Join-Path $PSScriptRoot "run-local-backend-regression.ps1")
if ($LASTEXITCODE -ne 0) { throw "run-local-backend-regression.ps1 failed" }

Write-Host ""
Write-Host "✅ ALL BACKEND ASSERTS PASSED" -ForegroundColor Green