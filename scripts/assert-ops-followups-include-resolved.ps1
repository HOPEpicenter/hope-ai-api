param(
  [string]$ApiBase = "http://127.0.0.1:7071/api",
  [string]$ApiKey = $env:HOPE_API_KEY
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

function Json-Get {
  param([string]$Url)

  return Invoke-RestMethod `
    -Method Get `
    -Uri $Url `
    -Headers @{ "x-api-key" = $ApiKey }
}

function Json-Post {
  param(
    [string]$Url,
    [object]$Body
  )

  return Invoke-RestMethod `
    -Method Post `
    -Uri $Url `
    -Headers @{ "x-api-key" = $ApiKey } `
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

function Get-FollowupItem {
  param(
    [object[]]$Items,
    [string]$VisitorId
  )

  return @($Items) | Where-Object { $_.visitorId -eq $VisitorId } | Select-Object -First 1
}

function Assert-PropertyMissing {
  param(
    [object]$Object,
    [string]$PropertyName,
    [string]$Message
  )

  if ($null -ne $Object.PSObject.Properties[$PropertyName]) {
    throw $Message
  }
}

if ([string]::IsNullOrWhiteSpace($ApiKey)) {
  throw "ApiKey is required."
}

$api = $ApiBase.Trim().TrimEnd("/")
$ops = "$api/ops"

Write-Host "=== ASSERT: Ops followups includeResolved parity ==="
Write-Host "ApiBase=$api"

$visitor = Json-Post "$api/visitors" @{
  name = "Include Resolved Parity"
  email = "include-resolved-parity@example.org"
}

$visitorId = [string]$visitor.visitorId
Assert ($visitorId.Length -gt 0) "visitorId should exist"

$now = (Get-Date).ToUniversalTime()

Json-Post "$api/formation/events" @{
  v = 1
  eventId = "evt-include-resolved-assign-$([guid]::NewGuid().ToString('N'))"
  visitorId = $visitorId
  type = "FOLLOWUP_ASSIGNED"
  occurredAt = $now.ToString("o")
  source = @{ system = "scripts/assert-ops-followups-include-resolved.ps1" }
  data = @{ assigneeId = "ops-user-include-resolved" }
} | Out-Null

Start-Sleep -Milliseconds 250

$active = Json-Get "$ops/followups?visitorId=$visitorId&includeResolved=false"
$activeItem = Get-FollowupItem -Items $active.items -VisitorId $visitorId

Assert ($null -ne $activeItem) "assigned visitor should appear before outcome"
Assert ($activeItem.followupResolved -ne $true) "assigned visitor should be unresolved before outcome"
Assert-PropertyMissing $activeItem "lastFollowupOutcome" "followups item must not expose canonical outcome ownership"

Json-Post "$api/formation/events" @{
  v = 1
  eventId = "evt-include-resolved-outcome-$([guid]::NewGuid().ToString('N'))"
  visitorId = $visitorId
  type = "FOLLOWUP_OUTCOME_RECORDED"
  occurredAt = $now.AddSeconds(1).ToString("o")
  source = @{ system = "scripts/assert-ops-followups-include-resolved.ps1" }
  data = @{ outcome = "resolved_by_include_resolved_assert" }
} | Out-Null

Start-Sleep -Milliseconds 250

$defaultAfterOutcome = Json-Get "$ops/followups?visitorId=$visitorId&includeResolved=false"
$defaultItem = Get-FollowupItem -Items $defaultAfterOutcome.items -VisitorId $visitorId

Assert ($null -eq $defaultItem) "resolved visitor should be excluded when includeResolved=false"

$includedAfterOutcome = Json-Get "$ops/followups?visitorId=$visitorId&includeResolved=true"
$includedItem = Get-FollowupItem -Items $includedAfterOutcome.items -VisitorId $visitorId

Assert ($null -ne $includedItem) "resolved visitor should be included when includeResolved=true"
Assert ($includedItem.followupResolved -eq $true) "included resolved item should set followupResolved=true"
Assert-PropertyMissing $includedItem "lastFollowupOutcome" "resolved followups item must not expose canonical outcome ownership"

$audit = Json-Post "$api/_ops/formation/profile-audit" @{
  visitorId = $visitorId
  repair = $false
}

Assert ($audit.ok -eq $true) "profile audit should succeed"
Assert ($audit.currentProfile.lastFollowupOutcome -eq "resolved_by_include_resolved_assert") "canonical profile should own lastFollowupOutcome"

Write-Host "OK: ops followups includeResolved parity assertion passed."
