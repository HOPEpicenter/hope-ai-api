param(
  [string]$Base   = ($env:HOPE_BASE_URL ? $env:HOPE_BASE_URL.TrimEnd("/") : "http://127.0.0.1:3000"),
  [string]$ApiKey = $env:HOPE_API_KEY
)

$ErrorActionPreference = "Stop"

if ([string]::IsNullOrWhiteSpace($ApiKey)) {
  throw "ApiKey required (set HOPE_API_KEY or pass -ApiKey)"
}

$headers = @{ "x-api-key" = $ApiKey }

function Assert([bool]$cond, [string]$msg) {
  if (-not $cond) { throw $msg }
}

function Has-Prop($obj, [string]$name) {
  return ($null -ne $obj) -and ($obj.PSObject.Properties.Name -contains $name)
}

function Has-NonNullProp($obj, [string]$name) {
  return (Has-Prop $obj $name) -and ($null -ne $obj.$name) -and (-not [string]::IsNullOrWhiteSpace([string]$obj.$name))
}
function To-DateTime([string]$Value) {
  return [DateTime]::Parse($Value).ToUniversalTime()
}

function New-Visitor([string]$namePrefix) {
  $body = @{
    name  = "$namePrefix $(Get-Date -Format s)"
    email = ("summary-transition+{0}@example.com" -f ([Guid]::NewGuid().ToString("N")))
  } | ConvertTo-Json -Depth 10

  $res = Invoke-RestMethod -ErrorAction Stop -Method POST -Uri "$Base/api/visitors" -ContentType "application/json" -Body $body
  if ([string]::IsNullOrWhiteSpace([string]$res.visitorId)) {
    throw "POST /api/visitors did not return visitorId"
  }
  return [string]$res.visitorId
}

function Get-IntegrationSummary([string]$visitorId) {
  $url = "$Base/api/integration/summary?visitorId=$([Uri]::EscapeDataString($visitorId))"
  return Invoke-RestMethod -ErrorAction Stop -Method GET -Uri $url -Headers $headers
}

function Get-IntegrationSummaryEventually([string]$visitorId, [scriptblock]$Predicate, [string]$Label) {
  $last = $null
  for ($i = 1; $i -le 5; $i++) {
    $last = Get-IntegrationSummary $visitorId
    if (& $Predicate $last) { return $last }
    if ($i -lt 5) { Start-Sleep -Milliseconds 400 }
  }

  Write-Host ("[{0}] final summary=" -f $Label) -ForegroundColor Yellow
  $last.summary | ConvertTo-Json -Depth 20 | Write-Host
  throw "Timed out waiting for integration summary predicate: $Label"
}

function Post-FollowupAssigned([string]$visitorId, [string]$assigneeId) {
  $evt = @{
    v          = 1
    eventId    = [Guid]::NewGuid().ToString()
    visitorId  = $visitorId
    type       = "FOLLOWUP_ASSIGNED"
    occurredAt = (Get-Date).ToUniversalTime().ToString("o")
    source     = @{ system = "assert-integration-summary-source-transition" }
    data       = @{ assigneeId = $assigneeId }
  } | ConvertTo-Json -Depth 20

  $resp = Invoke-WebRequest -ErrorAction Stop -Method POST -Uri "$Base/api/formation/events" -Headers $headers -ContentType "application/json" -Body $evt
  if (($resp.StatusCode -lt 200) -or ($resp.StatusCode -ge 300)) {
    throw "FOLLOWUP_ASSIGNED returned HTTP $($resp.StatusCode)"
  }
}

function Post-EngagementEvent([string]$visitorId, [string]$OccurredAt, [string]$Notes) {
  $evt = @{
    v          = 1
    eventId    = [Guid]::NewGuid().ToString()
    visitorId  = $visitorId
    type       = "note.add"
    occurredAt = $OccurredAt
    source     = @{ system = "assert-integration-summary-source-transition" }
    data       = @{ text = $Notes }
  } | ConvertTo-Json -Depth 20

  $resp = Invoke-WebRequest -ErrorAction Stop -Method POST -Uri "$Base/api/engagements/events" -Headers $headers -ContentType "application/json" -Body $evt
  if (($resp.StatusCode -lt 200) -or ($resp.StatusCode -ge 300)) {
    throw "engagement event returned HTTP $($resp.StatusCode)"
  }
}

Write-Host "=== INTEGRATION SUMMARY SOURCE TRANSITION ASSERT ===" -ForegroundColor Cyan

$visitorId = New-Visitor "SourceTransition AssignmentToEngagement"
$assigneeId = "ops-user-1"

Post-FollowupAssigned -visitorId $visitorId -assigneeId $assigneeId

$afterAssign = Get-IntegrationSummaryEventually $visitorId {
  param($r)
  (Has-Prop $r.summary "assignedTo") -and
  ($r.summary.assignedTo.ownerId -eq $assigneeId) -and
  ($r.summary.followupReason -eq "FOLLOWUP_ASSIGNED") -and
  ($r.summary.sources.engagement -eq $false) -and
  ($r.summary.sources.formation -eq $false)
} "after-assign"

Assert ($afterAssign.summary.needsFollowup -eq $true) "expected needsFollowup=true after assignment"
Assert ($null -eq $afterAssign.summary.lastEngagementAt) "expected lastEngagementAt=null after assignment-only"
Assert ($null -eq $afterAssign.summary.lastFormationAt) "expected lastFormationAt=null after assignment-only"
Assert ($null -eq $afterAssign.summary.lastIntegratedAt) "expected lastIntegratedAt=null after assignment-only"

$engAt = (Get-Date).ToUniversalTime().ToString("o")
Post-EngagementEvent -visitorId $visitorId -OccurredAt $engAt -Notes "source transition engagement"

$afterEng = Get-IntegrationSummaryEventually $visitorId {
  param($r)
  (Has-Prop $r.summary "assignedTo") -and
  ($r.summary.assignedTo.ownerId -eq $assigneeId) -and
  ($r.summary.followupReason -eq "FOLLOWUP_ASSIGNED") -and
  ($r.summary.sources.engagement -eq $true) -and
  ($r.summary.sources.formation -eq $false) -and
  (Has-NonNullProp $r.summary "lastEngagementAt") -and
  (Has-NonNullProp $r.summary "lastIntegratedAt")
} "after-engagement"

Assert ($afterEng.summary.needsFollowup -eq $true) "expected needsFollowup=true after engagement"
Assert ($afterEng.summary.sources.engagement -eq $true) "expected sources.engagement=true"
Assert ($afterEng.summary.sources.formation -eq $false) "expected sources.formation=false"
Assert ($null -eq $afterEng.summary.lastFormationAt) "expected lastFormationAt=null without formation source"
Assert ((To-DateTime $afterEng.summary.lastIntegratedAt) -eq (To-DateTime $afterEng.summary.lastEngagementAt)) "expected lastIntegratedAt == lastEngagementAt when only engagement source exists"

Write-Host "OK: source transition invariant passed. visitorId=$visitorId ownerId=$assigneeId" -ForegroundColor Green
