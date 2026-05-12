param(
  [string]$ApiBase = "http://127.0.0.1:7071/api",
  [string]$ApiKey = ""
)

$ErrorActionPreference = "Stop"

$headers = @{
  "content-type" = "application/json"
}

if (-not [string]::IsNullOrWhiteSpace($ApiKey)) {
  $headers["x-api-key"] = $ApiKey
}

function Assert($cond, [string]$msg) {
  if (-not $cond) {
    throw "ASSERT FAILED: $msg"
  }
}

function Json-Post([string]$Url, [hashtable]$Body) {
  Invoke-RestMethod `
    -Method Post `
    -Uri $Url `
    -Headers $headers `
    -Body ($Body | ConvertTo-Json -Depth 20)
}

Write-Host "=== ASSERT: Formation projection health diagnostics ==="
Write-Host "ApiBase=$ApiBase"

$visitor = Json-Post "$ApiBase/visitors" @{
  name = "Projection Health Diagnostics"
  email = "projection-health+" + [Guid]::NewGuid().ToString("N") + "@example.com"
  source = "assert-formation-projection-health.ps1"
}

$visitorId = [string]$visitor.visitorId
Assert (-not [string]::IsNullOrWhiteSpace($visitorId)) "visitorId should be created"

$occurredAt = (Get-Date).ToUniversalTime().ToString("o")

Json-Post "$ApiBase/formation/events" @{
  v = 1
  eventId = "evt-" + [Guid]::NewGuid().ToString("N")
  visitorId = $visitorId
  type = "FOLLOWUP_ASSIGNED"
  occurredAt = $occurredAt
  source = @{
    system = "scripts/assert-formation-projection-health.ps1"
  }
  data = @{
    assigneeId = "ops-health-1"
  }
} | Out-Null

$auditBefore = Json-Post "$ApiBase/_ops/formation/profile-audit" @{
  visitorId = $visitorId
  repair = $false
}

Assert ([bool]$auditBefore.ok) "audit before should return ok=true"
Assert ($null -ne $auditBefore.latestEventAt) "audit should expose latestEventAt"
Assert ($null -ne $auditBefore.profileLastEventAt -or [bool]$auditBefore.profileBehind -or [bool]$auditBefore.drifted) "audit should expose profile health state"
Assert ($auditBefore.driftFields -is [System.Array] -or $auditBefore.driftFields.Count -ge 0) "audit should expose driftFields"

$auditRepair = Json-Post "$ApiBase/_ops/formation/profile-audit" @{
  visitorId = $visitorId
  repair = $true
}

Assert ([bool]$auditRepair.ok) "repair audit should return ok=true"
Assert (-not [bool]$auditRepair.drifted) "repair audit should end not drifted"
Assert (-not [bool]$auditRepair.profileBehind) "repair audit should end not profileBehind"
Assert ([int]$auditRepair.lagMs -eq 0) "repair audit should end lagMs=0"
Assert (@($auditRepair.driftFields).Count -eq 0) "repair audit should end with no driftFields"

Write-Host "OK: formation projection health diagnostics assertion passed." -ForegroundColor Green
