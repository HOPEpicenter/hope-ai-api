param(
  [string]$Base = "http://localhost:3000",
  [string]$ApiKey = $(if (-not [string]::IsNullOrWhiteSpace($env:HOPE_API_KEY)) { $env:HOPE_API_KEY } else { $env:API_KEY })
)

$ErrorActionPreference = "Stop"

if ([string]::IsNullOrWhiteSpace($ApiKey)) {
  throw "HOPE_API_KEY (preferred) or API_KEY is required in env, or pass -ApiKey"
}

$headers = @{ "x-api-key" = $ApiKey }

function New-SafeEmail([string]$prefix) {
  $safe = ($prefix.ToLower() -replace '[^a-z0-9]+','-').Trim('-')
  return "$safe+$(New-Guid)@example.com"
}

function New-Visitor([string]$namePrefix) {
  $email = New-SafeEmail $namePrefix
  $body  = @{ name = $namePrefix; email = $email } | ConvertTo-Json -Depth 10
  $res   = Invoke-RestMethod -ErrorAction Stop -Method Post -Uri "$Base/api/visitors" -Headers $headers -ContentType "application/json" -Body $body
  if ($res.ok -ne $true) { throw "Create visitor returned non-ok: $($res | ConvertTo-Json -Depth 10)" }
  if ([string]::IsNullOrWhiteSpace([string]$res.visitorId)) { throw "Create visitor missing visitorId: $($res | ConvertTo-Json -Depth 10)" }
  return [string]$res.visitorId
}

function Get-IntegrationSummary([string]$visitorId) {
  $sumUrl = "$Base/api/integration/summary?visitorId=$([Uri]::EscapeDataString($visitorId))"
  return Invoke-RestMethod -ErrorAction Stop -Method Get -Uri $sumUrl -Headers $headers
}

function Post-FollowupAssigned([string]$visitorId, [string]$assigneeId, [datetime]$OccurredAt) {
  $evt = @{
    v          = 1
    eventId    = [guid]::NewGuid().ToString()
    visitorId  = $visitorId
    type       = "FOLLOWUP_ASSIGNED"
    occurredAt = $OccurredAt.ToUniversalTime().ToString("o")
    source     = @{ system = "assert-integration-summary-late-older-events" }
    data       = @{ assigneeId = $assigneeId }
  } | ConvertTo-Json -Depth 20

  $resp = Invoke-WebRequest -ErrorAction Stop -Method Post -Uri "$Base/api/formation/events" -Headers $headers -ContentType "application/json" -Body $evt

  if (($resp.StatusCode -lt 200) -or ($resp.StatusCode -ge 300)) {
    throw "FOLLOWUP_ASSIGNED returned HTTP $($resp.StatusCode)"
  }
}

function Post-EngagementEvent([string]$visitorId, [datetime]$OccurredAt, [string]$Notes) {
  $evt = @{
    v          = 1
    eventId    = [guid]::NewGuid().ToString()
    visitorId  = $visitorId
    type       = "dev_engaged"
    occurredAt = $OccurredAt.ToUniversalTime().ToString("o")
    source     = @{ system = "assert-integration-summary-late-older-events" }
    data       = @{ channel = "api"; notes = $Notes }
  } | ConvertTo-Json -Depth 20

  $resp = Invoke-WebRequest -ErrorAction Stop -Method Post -Uri "$Base/api/engagements/events" -Headers $headers -ContentType "application/json" -Body $evt

  if (($resp.StatusCode -lt 200) -or ($resp.StatusCode -ge 300)) {
    throw "engagement event returned HTTP $($resp.StatusCode)"
  }
}

function Has-Prop($obj, [string]$name) {
  return ($null -ne $obj) -and ($obj.PSObject.Properties.Name -contains $name)
}

function Assert($cond, [string]$msg) {
  if (-not $cond) { throw $msg }
}

function To-UtcDto {
  param([Parameter(Mandatory=$true)]$Value)
  if ($Value -is [DateTimeOffset]) { return $Value.ToUniversalTime() }
  if ($Value -is [DateTime]) { return ([DateTimeOffset]$Value).ToUniversalTime() }
  return [DateTimeOffset]::Parse([string]$Value).ToUniversalTime()
}

function To-IsoMillis {
  param([Parameter(Mandatory=$true)]$Value)
  return (To-UtcDto $Value).ToString("yyyy-MM-ddTHH:mm:ss.fffZ")
}

Write-Host "=== INTEGRATION SUMMARY LATE/OLDER EVENTS ASSERT ===" -ForegroundColor Cyan

# Case 1: newer engagement then older engagement must not regress summary
$visitorA = New-Visitor "Integration Late Older A"
$baselineA = Get-IntegrationSummary $visitorA

Assert ($baselineA.summary.needsFollowup -eq $true) "expected baselineA needsFollowup=true"
Assert ($baselineA.summary.followupReason -eq "no_engagement_yet") "expected baselineA followupReason=no_engagement_yet"
Assert (-not (Has-Prop $baselineA.summary "assignedTo")) "expected baselineA assignedTo absent"

$now = (Get-Date).ToUniversalTime()
$newerEngAt = $now.AddMinutes(-1)
$olderEngAt = $now.AddMinutes(-10)

Post-EngagementEvent -visitorId $visitorA -OccurredAt $newerEngAt -Notes "newer engagement"
$afterNewerA = Get-IntegrationSummary $visitorA

Assert (-not (Has-Prop $afterNewerA.summary "assignedTo")) "expected afterNewerA assignedTo absent"
Assert ([string]::IsNullOrWhiteSpace([string]$afterNewerA.summary.followupReason)) "expected afterNewerA followupReason absent after engagement exists"
Assert ((To-IsoMillis $afterNewerA.summary.lastEngagementAt) -eq (To-IsoMillis $newerEngAt)) "expected afterNewerA lastEngagementAt to match newer engagement"
Assert ((To-IsoMillis $afterNewerA.summary.lastIntegratedAt) -eq (To-IsoMillis $newerEngAt)) "expected afterNewerA lastIntegratedAt to match newer engagement"

Post-EngagementEvent -visitorId $visitorA -OccurredAt $olderEngAt -Notes "older engagement"
$afterOlderA = Get-IntegrationSummary $visitorA

Assert (-not (Has-Prop $afterOlderA.summary "assignedTo")) "expected afterOlderA assignedTo absent"
Assert ([string]::IsNullOrWhiteSpace([string]$afterOlderA.summary.followupReason)) "expected afterOlderA followupReason still absent after older engagement"
Assert ((To-IsoMillis $afterOlderA.summary.lastEngagementAt) -eq (To-IsoMillis $newerEngAt)) "expected afterOlderA lastEngagementAt to remain at newer engagement"
Assert ((To-IsoMillis $afterOlderA.summary.lastIntegratedAt) -eq (To-IsoMillis $newerEngAt)) "expected afterOlderA lastIntegratedAt to remain at newer engagement"

Write-Host "OK case A: older engagement did not regress summary. visitorId=$visitorA"

# Case 2: assigned summary state must survive older engagement arrival
$visitorB = New-Visitor "Integration Late Older B"
$assignAt = $now.AddMinutes(-2)
$olderEngBAt = $now.AddMinutes(-20)
$assigneeId = "ops-user-1"

Post-FollowupAssigned -visitorId $visitorB -assigneeId $assigneeId -OccurredAt $assignAt
$afterAssignB = Get-IntegrationSummary $visitorB

Assert (Has-Prop $afterAssignB.summary "assignedTo") "expected afterAssignB assignedTo present"
Assert ($afterAssignB.summary.assignedTo.ownerId -eq $assigneeId) "expected afterAssignB assignedTo.ownerId=$assigneeId"
Assert ($afterAssignB.summary.followupReason -eq "FOLLOWUP_ASSIGNED") "expected afterAssignB followupReason=FOLLOWUP_ASSIGNED"
Assert ((To-IsoMillis $afterAssignB.summary.lastFormationAt) -eq (To-IsoMillis $assignAt)) "expected afterAssignB lastFormationAt to match assignment"
Assert ((To-IsoMillis $afterAssignB.summary.lastIntegratedAt) -eq (To-IsoMillis $assignAt)) "expected afterAssignB lastIntegratedAt to match assignment"

Post-EngagementEvent -visitorId $visitorB -OccurredAt $olderEngBAt -Notes "older engagement after assignment"
$afterOlderB = Get-IntegrationSummary $visitorB

Assert (Has-Prop $afterOlderB.summary "assignedTo") "expected afterOlderB assignedTo present"
Assert ($afterOlderB.summary.assignedTo.ownerId -eq $assigneeId) "expected afterOlderB assignedTo.ownerId=$assigneeId"
Assert ($afterOlderB.summary.followupReason -eq "FOLLOWUP_ASSIGNED") "expected afterOlderB followupReason to remain FOLLOWUP_ASSIGNED"
Assert ((To-IsoMillis $afterOlderB.summary.lastFormationAt) -eq (To-IsoMillis $assignAt)) "expected afterOlderB lastFormationAt to remain assignment time"
Assert ((To-IsoMillis $afterOlderB.summary.lastIntegratedAt) -eq (To-IsoMillis $assignAt)) "expected afterOlderB lastIntegratedAt to remain assignment time"

Write-Host "OK case B: older engagement did not override assignment-driven summary. visitorId=$visitorB ownerId=$assigneeId" -ForegroundColor Green