# scripts/assert-foundation.ps1
$ErrorActionPreference = "Stop"
$ProgressPreference = "SilentlyContinue"

function Run-Script($Label, [string]$ScriptPath) {
  Write-Host $Label
  & pwsh -NoProfile -File $ScriptPath
}

# Resolve API base + key for downstream asserts
$ApiBase = if ($env:HOPE_API_BASE) { $env:HOPE_API_BASE } else { "http://127.0.0.1:3000/api" }
$ApiKey  = if ($env:HOPE_API_KEY)  { $env:HOPE_API_KEY }  else { "" }
if (-not $ApiKey) { throw "HOPE_API_KEY is not set (required for foundation asserts)." }


Write-Host "[assert-foundation] Checking Azurite Table service on 127.0.0.1:10002..."
$az = Test-NetConnection 127.0.0.1 -Port 10002 -WarningAction SilentlyContinue
if (-not $az.TcpTestSucceeded) {
  throw "Azurite Table service is not reachable at 127.0.0.1:10002. Start Azurite (Table) then re-run."
}

Run-Script "[assert-foundation] Smoke..." "scripts/dev-smoke.ps1"
Run-Script "[assert-foundation] Formation profiles list..." "scripts/assert-formation-profiles-list.ps1"
Write-Host "[assert-foundation] Formation milestones v1..."
pwsh -NoProfile -File "scripts/assert-formation-milestones-v1.ps1" -ApiBase $ApiBase -ApiKey $ApiKey
if ($LASTEXITCODE -ne 0) { throw "Formation milestones v1 failed (exit=$LASTEXITCODE)" }
Run-Script "[assert-foundation] Formation pagination..." "scripts/assert-formation-pagination.ps1"

Write-Host "[assert-foundation] OK: foundation checks passed."


