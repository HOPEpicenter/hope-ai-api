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

function New-Visitor([string]$namePrefix) {
  $body = @{
    name  = "$namePrefix $(Get-Date -Format s)"
    email = ("summary-sourceflags+{0}@example.com" -f ([Guid]::NewGuid().ToString("N")))
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
    source     = @{ system = "assert-integration-summary-source-flags" }
    data       = @{
      eventId    = [Guid]::NewGuid().ToString()
      assigneeId = $assigneeId
    }
  } | ConvertTo-Json -Depth 20

  $res = Invoke-RestMethod -ErrorAction Stop -Method POST -Uri "$Base/api/formation/events" -Headers $headers -ContentType "application/json" -Body $evt
  if (($res.PSObject.Properties.Name -contains "ok") -and $res.ok -ne $true) {
    throw "FOLLOWUP_ASSIGNED returned non-ok: $($res | ConvertTo-Json -Depth 20)"
  }
}

Write-Host "=== INTEGRATION SUMMARY SOURCE FLAGS ASSERT ===" -ForegroundColor Cyan

$visitorId = New-Visitor "SourceFlags AssignmentOnly"
$assigneeId = "ops-user-1"

Post-FollowupAssigned -visitorId $visitorId -assigneeId $assigneeId

$sum = Get-IntegrationSummaryEventually $visitorId {
  param($r)
  (Has-Prop $r.summary "assignedTo") -and
  ($r.summary.assignedTo.ownerId -eq $assigneeId) -and
  ($r.summary.followupReason -eq "FOLLOWUP_ASSIGNED")
} "assignment-only"

Assert (Has-Prop $sum.summary "assignedTo") "expected assignedTo present"
Assert ($sum.summary.assignedTo.ownerId -eq $assigneeId) "expected assignedTo.ownerId=$assigneeId"
Assert ($sum.summary.needsFollowup -eq $true) "expected needsFollowup=true"
Assert ($sum.summary.followupReason -eq "FOLLOWUP_ASSIGNED") "expected followupReason=FOLLOWUP_ASSIGNED"

Assert ($sum.summary.sources.engagement -eq $false) "expected sources.engagement=false"
Assert ($sum.summary.sources.formation -eq $false) "expected sources.formation=false"

Assert ($null -eq $sum.summary.lastEngagementAt) "expected lastEngagementAt=null"
Assert ($null -eq $sum.summary.lastFormationAt) "expected lastFormationAt=null"
Assert ($null -eq $sum.summary.lastIntegratedAt) "expected lastIntegratedAt=null"

Write-Host "OK: assignment-only source flags invariant passed. visitorId=$visitorId ownerId=$assigneeId" -ForegroundColor Green