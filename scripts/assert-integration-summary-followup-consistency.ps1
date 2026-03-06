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

function Post-FollowupAssigned([string]$visitorId, [string]$assigneeId) {
  $evt = @{
    v          = 1
    eventId    = [guid]::NewGuid().ToString()
    visitorId  = $visitorId
    type       = "FOLLOWUP_ASSIGNED"
    occurredAt = (Get-Date).ToUniversalTime().ToString("o")
    source     = @{ system = "assert-integration-summary-followup-consistency" }
    data       = @{ assigneeId = $assigneeId }
  } | ConvertTo-Json -Depth 20

  $resp = Invoke-WebRequest -ErrorAction Stop -Method Post -Uri "$Base/api/formation/events" -Headers $headers -ContentType "application/json" -Body $evt

  if (($resp.StatusCode -lt 200) -or ($resp.StatusCode -ge 300)) {
    throw "FOLLOWUP_ASSIGNED returned HTTP $($resp.StatusCode)"
  }

  if ([string]::IsNullOrWhiteSpace($resp.Content)) {
    Write-Host "FOLLOWUP_ASSIGNED accepted with empty body (HTTP $($resp.StatusCode))"
    return
  }

  $parsed = $null
  try {
    $parsed = $resp.Content | ConvertFrom-Json -ErrorAction Stop
  } catch {
    Write-Host "FOLLOWUP_ASSIGNED accepted with non-JSON body (HTTP $($resp.StatusCode))"
    return
  }

  $hasOk = $parsed.PSObject.Properties.Name -contains "ok"
  $hasAccepted = $parsed.PSObject.Properties.Name -contains "accepted"
  $hasVisitorId = $parsed.PSObject.Properties.Name -contains "visitorId"

  if (($hasOk -and $parsed.ok -eq $true) -or
      ($hasAccepted -and $parsed.accepted -eq $true) -or
      ($hasVisitorId -and -not [string]::IsNullOrWhiteSpace([string]$parsed.visitorId))) {
    return
  }

  throw "FOLLOWUP_ASSIGNED returned unexpected response: $($parsed | ConvertTo-Json -Depth 10)"
}

function Has-Prop($obj, [string]$name) {
  return ($null -ne $obj) -and ($obj.PSObject.Properties.Name -contains $name)
}

function Assert($cond, [string]$msg) {
  if (-not $cond) { throw $msg }
}

# --- Case 1: no assignee => assignedTo MUST be absent ---
$visitorNo = New-Visitor "No AssignedTo"
$sumNo = Get-IntegrationSummary $visitorNo

Assert (-not (Has-Prop $sumNo.summary "assignedTo")) "expected summary.assignedTo absent for visitorNo='${visitorNo}'"
"OK followup consistency (no assignee): visitorId=$visitorNo"

# --- Case 2: assigned => needsFollowup=true, followupReason present, assignedTo present ---
$visitorYes = New-Visitor "AssignedTo Smoke"
$assigneeId = "ops-user-1"
Post-FollowupAssigned -visitorId $visitorYes -assigneeId $assigneeId
$sumYes = Get-IntegrationSummary $visitorYes

Assert (Has-Prop $sumYes.summary "assignedTo") "expected summary.assignedTo present for visitorYes='${visitorYes}'"
Assert ($sumYes.summary.assignedTo.ownerId -eq $assigneeId) "assignedTo mismatch for visitorYes='${visitorYes}': expected '$assigneeId' got '$($sumYes.summary.assignedTo.ownerId)'"
Assert ($sumYes.summary.needsFollowup -eq $true) "expected needsFollowup=true when assignedTo is present (visitorYes='${visitorYes}')"
Assert (-not [string]::IsNullOrWhiteSpace([string]$sumYes.summary.followupReason)) "expected followupReason to be present/non-empty when assignedTo is present (visitorYes='${visitorYes}')"

"OK followup consistency (assigned): visitorId=$visitorYes ownerId=$assigneeId followupReason=$($sumYes.summary.followupReason)"