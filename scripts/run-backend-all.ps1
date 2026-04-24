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

# ---- EXPRESS SMOKE (baseline) ----
# Keep phase flags off here because ci-smoke-express.ps1 uses the /ops base,
# while Phase 3/4 auth/integration asserts target the /api surface.
Remove-Item Env:\HOPE_RUN_PHASE3_ASSERTS -ErrorAction SilentlyContinue
Remove-Item Env:\HOPE_RUN_PHASE4_ASSERTS -ErrorAction SilentlyContinue

Write-Host "=== STEP 1: Express Smoke ==="
pwsh -NoProfile -ExecutionPolicy Bypass -File (Join-Path $PSScriptRoot "ci-smoke-express.ps1")
if ($LASTEXITCODE -ne 0) { throw "ci-smoke-express.ps1 failed" }

Write-Host ""

# ---- FULL BACKEND REGRESSION ----
# Enforce all phases for the full backend regression path.
$env:HOPE_RUN_PHASE3_ASSERTS = "1"
$env:HOPE_RUN_PHASE4_ASSERTS = "1"

Write-Host "Phase 3 + Phase 4 asserts ENABLED" -ForegroundColor Yellow
Write-Host ""
Write-Host "=== STEP 2: Full Backend Regression ==="
pwsh -NoProfile -ExecutionPolicy Bypass -File (Join-Path $PSScriptRoot "run-local-backend-regression.ps1")
if ($LASTEXITCODE -ne 0) { throw "run-local-backend-regression.ps1 failed" }

Write-Host ""
Write-Host "✅ ALL BACKEND ASSERTS PASSED" -ForegroundColor Green