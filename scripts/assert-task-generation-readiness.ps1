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
$ops = "$api/ops"
$headers = @{ "x-api-key" = $ApiKey }

function Json-Get {
  param([string]$Url)

  return Invoke-RestMethod `
    -Method Get `
    -Uri $Url `
    -Headers $headers
}

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

function Get-FollowupItem {
  param(
    [object[]]$Items,
    [string]$VisitorId
  )

  return @($Items) | Where-Object { $_.visitorId -eq $VisitorId } | Select-Object -First 1
}

Write-Host "=== ASSERT: Task generation readiness ==="
Write-Host "ApiBase=$api"

$visitor = Json-Post "$api/visitors" @{
  name = "Task Generation Readiness"
  email = "task-generation-readiness@example.org"
}

$visitorId = [string]$visitor.visitorId
Assert ($visitorId.Length -gt 0) "visitorId should exist"

$occurredAt = (Get-Date).ToUniversalTime().ToString("o")

Json-Post "$api/formation/events" @{
  v = 1
  eventId = "evt-task-readiness-assign-$([guid]::NewGuid().ToString('N'))"
  visitorId = $visitorId
  type = "FOLLOWUP_ASSIGNED"
  occurredAt = $occurredAt
  source = @{ system = "scripts/assert-task-generation-readiness.ps1" }
  data = @{ assigneeId = "ops-task-generation-readiness" }
} | Out-Null

Start-Sleep -Milliseconds 250

$followups = Json-Get "$ops/followups?visitorId=$visitorId&includeResolved=false&limit=10"
Assert ($followups.ok -eq $true) "followups readiness query should succeed"

$item = Get-FollowupItem -Items $followups.items -VisitorId $visitorId
Assert ($null -ne $item) "assigned visitor should appear in followups readiness queue"

foreach ($field in @(
  "visitorId",
  "assignedTo",
  "followupResolved",
  "followupUrgency",
  "followupReason"
)) {
  Assert-HasProperty $item $field "followup item should expose $field"
}

Assert-HasProperty $item.assignedTo "ownerId" "assignedTo should expose ownerId"
Assert ($item.assignedTo.ownerId -eq "ops-task-generation-readiness") "owner should be deterministic"
Assert ($item.followupResolved -ne $true) "newly assigned followup should not be resolved"

$auditBeforeRepair = Json-Post "$api/_ops/formation/profile-audit" @{
  visitorId = $visitorId
  repair = $false
}

Assert ($auditBeforeRepair.ok -eq $true) "projection audit should succeed"

foreach ($field in @(
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
  Assert-HasProperty $auditBeforeRepair $field "projection audit should expose $field"
}

$auditRepair = Json-Post "$api/_ops/formation/profile-audit" @{
  visitorId = $visitorId
  repair = $true
}

Assert ($auditRepair.ok -eq $true) "projection repair audit should succeed"

$followupsAfterRepair = Json-Get "$ops/followups?visitorId=$visitorId&includeResolved=false&limit=10"
$itemAfterRepair = Get-FollowupItem -Items $followupsAfterRepair.items -VisitorId $visitorId

Assert ($null -ne $itemAfterRepair) "followup should remain visible after projection repair"
Assert ($itemAfterRepair.assignedTo.ownerId -eq $item.assignedTo.ownerId) "projection repair should preserve owner semantics"
Assert ($itemAfterRepair.followupResolved -eq $item.followupResolved) "projection repair should preserve resolved semantics"
Assert ($itemAfterRepair.followupReason -eq $item.followupReason) "projection repair should preserve followup reason"

Json-Post "$api/formation/events" @{
  v = 1
  eventId = "evt-task-readiness-outcome-$([guid]::NewGuid().ToString('N'))"
  visitorId = $visitorId
  type = "FOLLOWUP_OUTCOME_RECORDED"
  occurredAt = (Get-Date).ToUniversalTime().AddSeconds(1).ToString("o")
  source = @{ system = "scripts/assert-task-generation-readiness.ps1" }
  data = @{ outcome = "resolved_by_task_generation_readiness" }
} | Out-Null

Start-Sleep -Milliseconds 250

$defaultAfterOutcome = Json-Get "$ops/followups?visitorId=$visitorId&includeResolved=false&limit=10"
$defaultResolvedItem = Get-FollowupItem -Items $defaultAfterOutcome.items -VisitorId $visitorId
Assert ($null -eq $defaultResolvedItem) "resolved followup should be excluded by default"

$includedAfterOutcome = Json-Get "$ops/followups?visitorId=$visitorId&includeResolved=true&limit=10"
$includedResolvedItem = Get-FollowupItem -Items $includedAfterOutcome.items -VisitorId $visitorId

Assert ($null -ne $includedResolvedItem) "resolved followup should be available with includeResolved=true"
Assert ($includedResolvedItem.followupResolved -eq $true) "included resolved followup should expose followupResolved=true"
Assert ($includedResolvedItem.assignedTo.ownerId -eq "ops-task-generation-readiness") "resolved followup should preserve owner"

Assert ($null -eq $includedResolvedItem.PSObject.Properties["lastFollowupOutcome"]) "followups readiness surface must not own canonical outcome state"

$auditAfterOutcome = Json-Post "$api/_ops/formation/profile-audit" @{
  visitorId = $visitorId
  repair = $false
}

Assert ($auditAfterOutcome.ok -eq $true) "post-outcome projection audit should succeed"
Assert ($auditAfterOutcome.currentProfile.lastFollowupOutcome -eq "resolved_by_task_generation_readiness") "profile remains canonical outcome owner"

Write-Host "OK: task generation readiness assertion passed."

