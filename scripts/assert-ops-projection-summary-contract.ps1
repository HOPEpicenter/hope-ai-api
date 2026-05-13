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
Assert ($summaryNoRepair.healthy -eq ((-not $summaryNoRepair.drifted) -and (-not $summaryNoRepair.profileBehind))) "summary healthy should equal !drifted && !profileBehind"
Assert ($summaryNoRepair.driftCount -eq @($auditNoRepair.driftFields).Count) "summary driftCount should match audit driftFields count"
Assert ($null -ne $summaryNoRepair.latestEventAt) "summary should expose latestEventAt"
Assert ($summaryNoRepair.PSObject.Properties["profileLastEventAt"] -ne $null) "summary should expose profileLastEventAt"

$auditRepair = Json-Post "$api/_ops/formation/profile-audit" @{
  visitorId = $visitorId
  repair = $true
}

Assert ($auditRepair.ok -eq $true) "repair=true audit should succeed"

$summaryRepair = Get-ProjectionHealthSummary -Audit $auditRepair

Assert ($summaryRepair.visitorId -eq $visitorId) "repair summary should preserve visitorId"
Assert ($null -ne $summaryRepair.healthy) "repair summary should expose healthy"
Assert ($summaryRepair.driftCount -ge 0) "repair summary should expose non-negative driftCount"
Assert ($summaryRepair.healthy -eq ((-not $summaryRepair.drifted) -and (-not $summaryRepair.profileBehind))) "repair summary healthy should equal !drifted && !profileBehind"
Assert ($summaryRepair.driftCount -eq @($auditRepair.driftFields).Count) "repair summary driftCount should match audit driftFields count"
Assert ($summaryRepair.PSObject.Properties["latestEventAt"] -ne $null) "repair summary should expose latestEventAt"
Assert ($summaryRepair.PSObject.Properties["profileLastEventAt"] -ne $null) "repair summary should expose profileLastEventAt"

$auditAfterRepair = Json-Post "$api/_ops/formation/profile-audit" @{
  visitorId = $visitorId
  repair = $false
}

$summaryAfterRepair = Get-ProjectionHealthSummary -Audit $auditAfterRepair

Assert ($summaryAfterRepair.visitorId -eq $visitorId) "post-repair summary should preserve visitorId"
Assert ($summaryAfterRepair.driftCount -ge 0) "post-repair driftCount should remain non-negative"
Assert ($summaryAfterRepair.healthy -eq ((-not $summaryAfterRepair.drifted) -and (-not $summaryAfterRepair.profileBehind))) "post-repair summary healthy should equal !drifted && !profileBehind"
Assert ($summaryAfterRepair.driftCount -eq @($auditAfterRepair.driftFields).Count) "post-repair driftCount should match audit driftFields count"
Assert ($summaryAfterRepair.PSObject.Properties["latestEventAt"] -ne $null) "post-repair summary should expose latestEventAt"
Assert ($summaryAfterRepair.PSObject.Properties["profileLastEventAt"] -ne $null) "post-repair summary should expose profileLastEventAt"

$auditAfterRepair2 = Json-Post "$api/_ops/formation/profile-audit" @{
  visitorId = $visitorId
  repair = $false
}

$summaryAfterRepair2 = Get-ProjectionHealthSummary -Audit $auditAfterRepair2

Assert ($summaryAfterRepair2.visitorId -eq $summaryAfterRepair.visitorId) "repeated post-repair summary should preserve visitorId"
Assert ($summaryAfterRepair2.healthy -eq $summaryAfterRepair.healthy) "repeated post-repair summary should preserve healthy"
Assert ($summaryAfterRepair2.drifted -eq $summaryAfterRepair.drifted) "repeated post-repair summary should preserve drifted"
Assert ($summaryAfterRepair2.profileBehind -eq $summaryAfterRepair.profileBehind) "repeated post-repair summary should preserve profileBehind"
Assert ($summaryAfterRepair2.driftCount -eq $summaryAfterRepair.driftCount) "repeated post-repair summary should preserve driftCount"

Write-Host "OK: OPS projection summary contract assertion passed."

