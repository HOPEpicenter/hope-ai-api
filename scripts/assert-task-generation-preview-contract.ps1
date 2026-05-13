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
function Get-OptionalPropertyValue {
  param(
    [object]$Object,
    [string]$PropertyName
  )

  $prop = $Object.PSObject.Properties[$PropertyName]

  if ($null -eq $prop) {
    return $null
  }

  return $prop.Value
}

function New-TaskPreview {
  param(
    [object]$Followup,
    [object]$Audit
  )

  $projectionHealthy = (($Audit.drifted -eq $false) -and ($Audit.profileBehind -eq $false))
  $eligible = (
    ($Followup.followupResolved -ne $true) -and
    ($null -ne $Followup.assignedTo) -and
    (-not [string]::IsNullOrWhiteSpace([string]$Followup.assignedTo.ownerId)) -and
    $projectionHealthy
  )

  return [pscustomobject]@{
    visitorId = $Followup.visitorId
    ownerId = $Followup.assignedTo.ownerId
    priorityBand = $Followup.PSObject.Properties["priorityBand"]?.Value
    priorityReason = $Followup.PSObject.Properties["priorityReason"]?.Value
    followupUrgency = $Followup.PSObject.Properties["followupUrgency"]?.Value
    followupResolved = [bool]$Followup.followupResolved
    projectionHealthy = [bool]$projectionHealthy
    projectionDrifted = [bool]$Audit.drifted
    projectionProfileBehind = [bool]$Audit.profileBehind
    candidateTaskType = "FOLLOWUP"
    candidateTaskEligible = [bool]$eligible
  }
}

Write-Host "=== ASSERT: Task generation preview contract ==="
Write-Host "ApiBase=$api"

$visitor = Json-Post "$api/visitors" @{
  name = "Task Generation Preview"
  email = "task-generation-preview@example.org"
}

$visitorId = [string]$visitor.visitorId
Assert ($visitorId.Length -gt 0) "visitorId should exist"

$occurredAt = (Get-Date).ToUniversalTime().ToString("o")

Json-Post "$api/formation/events" @{
  v = 1
  eventId = "evt-task-preview-assign-$([guid]::NewGuid().ToString('N'))"
  visitorId = $visitorId
  type = "FOLLOWUP_ASSIGNED"
  occurredAt = $occurredAt
  source = @{ system = "scripts/assert-task-generation-preview-contract.ps1" }
  data = @{ assigneeId = "ops-task-preview" }
} | Out-Null

Start-Sleep -Milliseconds 250

$followups = Json-Get "$ops/followups?visitorId=$visitorId&includeResolved=false&limit=10"
Assert ($followups.ok -eq $true) "followups query should succeed"

$followup = Get-FollowupItem -Items $followups.items -VisitorId $visitorId
Assert ($null -ne $followup) "followup should be available for preview derivation"

$audit = Json-Post "$api/_ops/formation/profile-audit" @{
  visitorId = $visitorId
  repair = $true
}

Assert ($audit.ok -eq $true) "projection audit repair should succeed"

$preview1 = New-TaskPreview -Followup $followup -Audit $audit

foreach ($field in @(
  "visitorId",
  "ownerId",
  "priorityBand",
  "priorityReason",
  "followupUrgency",
  "followupResolved",
  "projectionHealthy",
  "projectionDrifted",
  "projectionProfileBehind",
  "candidateTaskType",
  "candidateTaskEligible"
)) {
  Assert-HasProperty $preview1 $field "preview should expose $field"
}

Assert ($preview1.visitorId -eq $visitorId) "preview should preserve visitorId"
Assert ($preview1.ownerId -eq "ops-task-preview") "preview should preserve ownerId"
Assert ($preview1.candidateTaskType -eq "FOLLOWUP") "preview candidateTaskType should be FOLLOWUP"
Assert ($preview1.followupResolved -eq $false) "unresolved followup preview should expose followupResolved=false"
Assert ($preview1.projectionHealthy -eq ((-not $preview1.projectionDrifted) -and (-not $preview1.projectionProfileBehind))) "projectionHealthy should equal !drifted && !profileBehind"
Assert ($preview1.candidateTaskEligible -eq ($preview1.followupResolved -eq $false -and $preview1.projectionHealthy -eq $true -and -not [string]::IsNullOrWhiteSpace($preview1.ownerId))) "candidateTaskEligible should be deterministic"

$preview2 = New-TaskPreview -Followup $followup -Audit $audit

Assert (($preview1 | ConvertTo-Json -Depth 20 -Compress) -eq ($preview2 | ConvertTo-Json -Depth 20 -Compress)) "preview derivation should be deterministic"

Json-Post "$api/formation/events" @{
  v = 1
  eventId = "evt-task-preview-outcome-$([guid]::NewGuid().ToString('N'))"
  visitorId = $visitorId
  type = "FOLLOWUP_OUTCOME_RECORDED"
  occurredAt = (Get-Date).ToUniversalTime().AddSeconds(1).ToString("o")
  source = @{ system = "scripts/assert-task-generation-preview-contract.ps1" }
  data = @{ outcome = "resolved_by_task_preview_contract" }
} | Out-Null

Start-Sleep -Milliseconds 250

$resolvedFollowups = Json-Get "$ops/followups?visitorId=$visitorId&includeResolved=true&limit=10"
$resolvedFollowup = Get-FollowupItem -Items $resolvedFollowups.items -VisitorId $visitorId

Assert ($null -ne $resolvedFollowup) "resolved followup should be available for resolved preview"

$auditAfterResolved = Json-Post "$api/_ops/formation/profile-audit" @{
  visitorId = $visitorId
  repair = $true
}

$resolvedPreview = New-TaskPreview -Followup $resolvedFollowup -Audit $auditAfterResolved

Assert ($resolvedPreview.followupResolved -eq $true) "resolved preview should expose followupResolved=true"
Assert ($resolvedPreview.candidateTaskEligible -eq $false) "resolved followup should not be task eligible"
Assert ($null -eq $resolvedFollowup.PSObject.Properties["lastFollowupOutcome"]) "preview source must not read canonical outcome from followups surface"
Assert ($auditAfterResolved.currentProfile.lastFollowupOutcome -eq "resolved_by_task_preview_contract") "profile should remain canonical outcome owner"

Write-Host "OK: task generation preview contract assertion passed."


