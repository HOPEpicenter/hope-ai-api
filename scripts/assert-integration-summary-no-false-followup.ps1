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
    email = ("summary-nofalse+{0}@example.com" -f ([Guid]::NewGuid().ToString("N")))
  } | ConvertTo-Json -Depth 10

  $res = Invoke-RestMethod -Method POST -Uri "$Base/api/visitors" -ContentType "application/json" -Body $body
  if ([string]::IsNullOrWhiteSpace([string]$res.visitorId)) {
    throw "POST /api/visitors did not return visitorId"
  }
  return [string]$res.visitorId
}

function Get-IntegrationSummary([string]$visitorId) {
  $url = "$Base/api/integration/summary?visitorId=$([Uri]::EscapeDataString($visitorId))"
  return Invoke-RestMethod -Method GET -Uri $url -Headers $headers
}

function Post-Engagement([string]$visitorId) {
  $body = @{
    v          = 1
    eventId    = "evt-$([Guid]::NewGuid().ToString('N'))"
    visitorId  = $visitorId
    type       = "note.add"
    occurredAt = (Get-Date).ToUniversalTime().ToString("o")
    source     = @{ system = "assert-integration-summary-no-false-followup" }
    data       = @{ text = "engagement should not create followup ownership" }
  } | ConvertTo-Json -Depth 20

  $resp = Invoke-RestMethod -Method POST -Uri "$Base/api/engagements/events" -Headers $headers -ContentType "application/json" -Body $body
  if (($resp.PSObject.Properties.Name -contains "ok") -and $resp.ok -ne $true) {
    throw "POST /api/engagements/events returned non-ok: $($resp | ConvertTo-Json -Depth 20)"
  }
}

function Post-FormationNonAssignment([string]$visitorId) {
  $body = @{
    v          = 1
    eventId    = "evt-$([Guid]::NewGuid().ToString('N'))"
    visitorId  = $visitorId
    type       = "FOLLOWUP_CONTACTED"
    occurredAt = (Get-Date).ToUniversalTime().ToString("o")
    source     = @{ system = "assert-integration-summary-no-false-followup" }
    data       = @{ method = "sms"; result = "reached" }
  } | ConvertTo-Json -Depth 20

  $resp = Invoke-RestMethod -Method POST -Uri "$Base/api/formation/events" -Headers $headers -ContentType "application/json" -Body $body
  if (($resp.PSObject.Properties.Name -contains "ok") -and $resp.ok -ne $true) {
    throw "POST /api/formation/events returned non-ok: $($resp | ConvertTo-Json -Depth 20)"
  }
}

# Case 1: engagement-only must not create followup ownership fields
$visitor1 = New-Visitor "NoFalseFollowup EngagementOnly"
Post-Engagement -visitorId $visitor1
$sum1 = Get-IntegrationSummary $visitor1

Assert (-not (Has-Prop $sum1.summary "assignedTo")) "engagement-only visitor unexpectedly had summary.assignedTo"
if (Has-Prop $sum1.summary "followupReason") {
  Assert ([string]::IsNullOrWhiteSpace([string]$sum1.summary.followupReason)) "engagement-only visitor unexpectedly had non-empty summary.followupReason"
}
if (Has-Prop $sum1.summary "needsFollowup") {
  Assert ($sum1.summary.needsFollowup -ne $true) "engagement-only visitor unexpectedly had needsFollowup=true"
}

Write-Host "OK: engagement-only did not synthesize follow-up ownership"

# Case 2: non-assignment formation event must not create assignedTo
$visitor2 = New-Visitor "NoFalseFollowup FormationNonAssignment"
Post-FormationNonAssignment -visitorId $visitor2
$sum2 = Get-IntegrationSummary $visitor2

Assert (-not (Has-Prop $sum2.summary "assignedTo")) "non-assignment formation event unexpectedly created summary.assignedTo"
Write-Host "OK: non-assignment formation event did not synthesize assignedTo"

Write-Host "[assert-integration-summary-no-false-followup] OK" -ForegroundColor Green