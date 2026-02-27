param(
  [string]$Base = "http://localhost:3000",
  [string]$ApiKey = $(if (-not [string]::IsNullOrWhiteSpace($env:HOPE_API_KEY)) { $env:HOPE_API_KEY } else { $env:API_KEY })
)

if ([string]::IsNullOrWhiteSpace($ApiKey)) { throw "HOPE_API_KEY (preferred) or API_KEY is required in env, or pass -ApiKey" }
$headers = @{ "x-api-key" = $ApiKey }

function New-SafeEmail([string]$prefix) {
  $safe = ($prefix.ToLower() -replace '[^a-z0-9]+','-').Trim('-')
  return "$safe+$(New-Guid)@example.com"
}

function New-Visitor([string]$namePrefix) {
  $email = New-SafeEmail $namePrefix
  $body  = @{ name = $namePrefix; email = $email } | ConvertTo-Json
  $res   = Invoke-RestMethod -ErrorAction Stop -Method Post -Uri "$Base/api/visitors" -Headers $headers -ContentType "application/json" -Body $body
  if ($res.ok -ne $true) { throw "Create visitor returned non-ok: $($res | ConvertTo-Json -Depth 10)" }
  if ([string]::IsNullOrWhiteSpace($res.visitorId)) { throw "Create visitor missing visitorId: $($res | ConvertTo-Json -Depth 10)" }
  return $res.visitorId
}

function Get-IntegrationSummary([string]$visitorId) {
  $sumUrl = "$Base/api/integration/summary?visitorId=$([Uri]::EscapeDataString($visitorId))"
  return Invoke-RestMethod -Method Get -Uri $sumUrl -Headers $headers
}

function Post-FollowupAssigned([string]$visitorId, [string]$assigneeId) {
  $evt = @{
    v = 1
    visitorId = $visitorId
    type = "FOLLOWUP_ASSIGNED"
    occurredAt = (Get-Date).ToUniversalTime().ToString("o")
    source = @{ system = "assert-integration-summary-assignedto" }
eventId = [guid]::NewGuid().ToString()
data = @{ eventId = [guid]::NewGuid().ToString(); assignedTo = $assigneeId }
  } | ConvertTo-Json -Depth 10

  $res = Invoke-RestMethod -ErrorAction Stop -Method Post -Uri "$Base/api/formation/events" -Headers $headers -ContentType "application/json" -Body $evt
  if ($res.ok -ne $true) { throw "FOLLOWUP_ASSIGNED returned non-ok: $($res | ConvertTo-Json -Depth 10)" }
}

# --- Case 1: no assignee => assignedTo MUST be absent ---
$visitorNo = New-Visitor "No AssignedTo"
$sumNo = Get-IntegrationSummary $visitorNo
if ($sumNo.summary.PSObject.Properties.Name -contains "assignedTo") {
  throw "expected summary.assignedTo absent for visitorNo='${visitorNo}', but got: $($sumNo.summary.assignedTo | ConvertTo-Json -Depth 10)"
}
"OK no-assignee: visitorId=$visitorNo assignedTo absent"

# --- Case 2: has assignee => assignedTo MUST be present + match ---
$visitorYes = New-Visitor "AssignedTo Smoke"
$assigneeId = "ops-user-1"
Post-FollowupAssigned -visitorId $visitorYes -assigneeId $assigneeId
$sumYes = Get-IntegrationSummary $visitorYes

if (-not ($sumYes.summary.PSObject.Properties.Name -contains "assignedTo")) {
  throw "expected summary.assignedTo present for visitorYes='${visitorYes}', but it was absent. summary=$($sumYes.summary | ConvertTo-Json -Depth 20)"
}
if ($sumYes.summary.assignedTo.ownerId -ne $assigneeId) {
  throw "assignedTo mismatch for visitorYes='${visitorYes}': expected '$assigneeId' got '$($sumYes.summary.assignedTo.ownerId)'"
}
"OK assigned: visitorId=$visitorYes ownerId=$assigneeId"




