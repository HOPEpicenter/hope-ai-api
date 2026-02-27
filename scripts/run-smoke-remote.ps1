# scripts/run-smoke-remote.ps1
# Runs the smoke suite against a REMOTE (or already-running) environment.
# Requires: OPS_BASE_URL (root, e.g. https://staging.example.com) and HOPE_API_KEY.
# Does NOT build or start the server.

[CmdletBinding()]
param(
  # Root base URL, e.g. https://staging.example.com (NO trailing slash)
  [Parameter(Mandatory=$false)]
  [string]$BaseUrl = $env:OPS_BASE_URL,

  # API key for /ops and protected /api endpoints
  [Parameter(Mandatory=$false)]
  [string]$ApiKey = $env:HOPE_API_KEY
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"
$ProgressPreference = "SilentlyContinue"

function Require-Value([string]$Name, [string]$Value) {
  if ([string]::IsNullOrWhiteSpace($Value)) {
    throw "$Name is required. Set env:$Name or pass -$Name."
  }
  return $Value
}

$BaseUrl = Require-Value "OPS_BASE_URL" $BaseUrl
$ApiKey  = Require-Value "HOPE_API_KEY"  $ApiKey

$BaseUrl = $BaseUrl.Trim().TrimEnd("/")

Write-Host ""
Write-Host "== Remote smoke ==" -ForegroundColor Cyan
Write-Host ("BaseUrl: {0}" -f $BaseUrl)
Write-Host ("ApiKey : len={0} last4={1}" -f $ApiKey.Length, ($ApiKey.Substring([Math]::Max(0,$ApiKey.Length-4))))

# Quick health probe (fail fast)
$headers = @{ "x-api-key" = $ApiKey }
$healthUrl = "$BaseUrl/ops/health"

Write-Host ""
Write-Host ("== Probe {0} ==" -f $healthUrl) -ForegroundColor Cyan
try {
  $h = Invoke-RestMethod -Method Get -Uri $healthUrl -Headers $headers -TimeoutSec 15
  Write-Host ("Health OK: {0}" -f ($h | ConvertTo-Json -Depth 10))
} catch {
  $msg = $_.Exception.Message
  throw ("Health probe failed for {0}. Error: {1}" -f $healthUrl, $msg)
}

# Run smoke tests (already covers /ops + /api regressions)
Write-Host ""
Write-Host "== Run smoke-tests.ps1 ==" -ForegroundColor Cyan
$smokePath = Join-Path $PSScriptRoot "smoke-tests.ps1"

pwsh -NoProfile -ExecutionPolicy Bypass -File $smokePath -BaseUrl $BaseUrl -ApiKey $ApiKey
if ($LASTEXITCODE -ne 0) {
  throw "Remote smoke failed (exit=$LASTEXITCODE)."
}

Write-Host ""
Write-Host "REMOTE SMOKE PASSED" -ForegroundColor Green
