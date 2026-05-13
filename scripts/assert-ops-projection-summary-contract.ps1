param(
  [string]$ApiBase = "http://127.0.0.1:7071/api",
  [string]$ApiKey = $env:HOPE_API_KEY
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

if ([string]::IsNullOrWhiteSpace($ApiKey)) {
  throw "ApiKey is required."
}

$api = $ApiBase.Trim().TrimEnd("/")
$headers = @{ "x-api-key" = $ApiKey }

function Json-Post {
  param(
    [string]$Url,
    [object]$Body
  )

  return Invoke-RestMethod `
    -Method Post `
    -Uri $Url `
    -Headers $headers `
    -ContentType "application/json" `
    -Body ($Body | ConvertTo-Json -Depth 20)
}

function Assert {
  param(
    [bool]$Condition,
    [string]$Message
  )

  if (-not $Condition) {
    throw "ASSERT FAILED: $Message"
  }
}

function Assert-HasProperty {
  param(
    [object]$Object,
    [string]$PropertyName,
    [string]$Message
  )

  Assert ($null -ne $Object.PSObject.Properties[$PropertyName]) $Message
}

function Get-ProjectionHealthSummary {
  param([object]$Audit)

  $driftCount = @($Audit.driftFields).Count

  return [pscustomobject]@{
    visitorId = $Audit.visitorId
    healthy = (($Audit.drifted -eq $false) -and ($Audit.profileBehind -eq $false))
    drifted = [bool]$Audit.drifted
    repaired = [bool]$Audit.repaired
    profileBehind = [bool]$Audit.profileBehind
    lagMs = $Audit.lagMs
    latestEventAt = $Audit.latestEventAt
    profileLastEventAt = $Audit.profileLastEventAt
    driftCount = $driftCount
  }
}

Write-Host "=== ASSERT: OPS projection summary contract ==="
Write-Host "ApiBase=$api"

$visitor = Json-Post "$api/visitors" @{
  name = "Projection Summary Contract"
  email = "projection-summary-contract@example.org"
}

$visitorId = [string]$visitor.visitorId
Assert ($visitorId.Length -gt 0) "visitorId should exist"

$occurredAt = (Get-Date).ToUniversalTime().ToString("o")

Json-Post "$api/formation/events" @{
  v = 1
  eventId = "evt-projection-summary-$([guid]::NewGuid().ToString('N'))"
  visitorId = $visitorId
  type = "FOLLOWUP_ASSIGNED"
  occurredAt = $occurredAt
  source = @{ system = "scripts/assert-ops-projection-summary-contract.ps1" }
  data = @{ assigneeId = "ops-projection-summary" }
} | Out-Null

$auditNoRepair = Json-Post "$api/_ops/formation/profile-audit" @{
  visitorId = $visitorId
  repair = $false
}

Assert ($auditNoRepair.ok -eq $true) "repair=false audit should succeed"

foreach ($field in @(
  "visitorId",
  "drifted",
  "repaired",
  "profileBehind",
  "lagMs",
  "latestEventAt",
  "profileLastEventAt",
  "driftFields",
  "currentProfile",
  "expectedProfile"
)) {
  Assert-HasProperty $auditNoRepair $field "audit should expose $field"
}

$summaryNoRepair = Get-ProjectionHealthSummary -Audit $auditNoRepair

Assert ($summaryNoRepair.visitorId -eq $visitorId) "summary should preserve visitorId"
Assert ($null -ne $summaryNoRepair.healthy) "summary should expose healthy"
Assert ($null -ne $summaryNoRepair.drifted) "summary should expose drifted"
Assert ($null -ne $summaryNoRepair.repaired) "summary should expose repaired"
Assert ($null -ne $summaryNoRepair.profileBehind) "summary should expose profileBehind"
Assert ($summaryNoRepair.driftCount -ge 0) "summary should expose non-negative driftCount"

$auditRepair = Json-Post "$api/_ops/formation/profile-audit" @{
  visitorId = $visitorId
  repair = $true
}

Assert ($auditRepair.ok -eq $true) "repair=true audit should succeed"

$summaryRepair = Get-ProjectionHealthSummary -Audit $auditRepair

Assert ($summaryRepair.visitorId -eq $visitorId) "repair summary should preserve visitorId"
Assert ($null -ne $summaryRepair.healthy) "repair summary should expose healthy"
Assert ($summaryRepair.driftCount -ge 0) "repair summary should expose non-negative driftCount"

$auditAfterRepair = Json-Post "$api/_ops/formation/profile-audit" @{
  visitorId = $visitorId
  repair = $false
}

$summaryAfterRepair = Get-ProjectionHealthSummary -Audit $auditAfterRepair

Assert ($summaryAfterRepair.visitorId -eq $visitorId) "post-repair summary should preserve visitorId"
Assert ($summaryAfterRepair.driftCount -ge 0) "post-repair driftCount should remain non-negative"

Write-Host "OK: OPS projection summary contract assertion passed."
