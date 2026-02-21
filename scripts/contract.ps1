param(
  [string]$BaseUrl = $env:HOPE_BASE_URL
)

if (-not $BaseUrl) { throw "BaseUrl required (set HOPE_BASE_URL or pass -BaseUrl)" }

Write-Host "== contract.ps1 =="

$env:HOPE_BASE_URL = $BaseUrl

pwsh -NoProfile -ExecutionPolicy Bypass -File .\scripts\smoke.ps1
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

pwsh -NoProfile -ExecutionPolicy Bypass -File .\scripts\smoke-visitor-engagements-e2e.ps1 -BaseUrl $BaseUrl
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

pwsh -NoProfile -ExecutionPolicy Bypass -File .\scripts\regression.ps1
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

Write-Host "PASS contract suite ✅"