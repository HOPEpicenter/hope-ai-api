param(
  [string]$Base = "http://127.0.0.1:3000",
  [string]$ApiBase = "http://127.0.0.1:3000/api"
)

$ErrorActionPreference = "Stop"

function Fail($msg) {
  Write-Host "[FAIL] $msg" -ForegroundColor Red
  exit 1
}

function Ok($msg) {
  Write-Host $msg -ForegroundColor Green
}

if ([string]::IsNullOrWhiteSpace($env:HOPE_API_KEY)) {
  Fail "HOPE_API_KEY env var is not set in this shell."
}

$headers = @{ "x-api-key" = $env:HOPE_API_KEY }

function New-VisitorId {
  $body = @{
    name   = "AssignedTo Regression"
    email  = ("assignedto+" + (Get-Date -Format "yyyyMMddHHmmss") + "@example.com")
    source = "assert-integration-summary-assignedto"
  } | ConvertTo-Json

  $res = Invoke-RestMethod -Method Post -Uri "$ApiBase/visitors" -Headers $headers -ContentType "application/json" -Body $body
  if (-not $res.visitorId) { Fail "Create visitor did not return visitorId" }
  return [string]$res.visitorId
}

function Post-FollowupAssigned([string]$visitorId, [string]$assigneeId) {
  $evt = @{
    v = 1
    visitorId = $visitorId
    type = "FOLLOWUP_ASSIGNED"
    occurredAt = (Get-Date).ToUniversalTime().ToString("o")
    source = @{ system = "assert-integration-summary-assignedto" }
    data = @{ assigneeId = $assigneeId }
  } | ConvertTo-Json -Depth 10

  $res = Invoke-RestMethod -Method Post -Uri "$ApiBase/formation/events" -Headers $headers -ContentType "application/json" -Body $evt
  if ($res.ok -ne $true) { Fail "FOLLOWUP_ASSIGNED returned non-ok: $($res | ConvertTo-Json -Depth 10)" }
}

function Get-IntegrationSummary([string]$visitorId) {
  # Prefer /api surface; this endpoint is expected to exist in repo flows.
  return Invoke-RestMethod -Method Get -Uri "$ApiBase/integration/summary?visitorId=$visitorId" -Headers $headers
}

# --- Case 1: no-assignee -> assignedTo absent/null ---
$vid1 = New-VisitorId
$sum1 = Get-IntegrationSummary -visitorId $vid1

if ($null -ne $sum1.assignedTo -and -not [string]::IsNullOrWhiteSpace([string]$sum1.assignedTo)) {
  Fail "Expected assignedTo absent/blank for no-assignee visitorId=$vid1; got: $($sum1.assignedTo)"
}
Ok "OK no-assignee: visitorId=$vid1 assignedTo absent"

# --- Case 2: assigned -> assignedTo matches expected ---
$vid2 = New-VisitorId
Post-FollowupAssigned -visitorId $vid2 -assigneeId "ops-user-1"

$sum2 = Get-IntegrationSummary -visitorId $vid2

if ([string]::IsNullOrWhiteSpace([string]$sum2.assignedTo)) {
  Fail "Expected assignedTo present for assigned visitorId=$vid2; got blank"
}
if ([string]$sum2.assignedTo -ne "ops-user-1") {
  Fail "Expected assignedTo=ops-user-1 for visitorId=$vid2; got: $($sum2.assignedTo)"
}
Ok "OK assigned: visitorId=$vid2 ownerId=ops-user-1"
