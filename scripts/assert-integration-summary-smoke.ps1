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

function Get-IntegrationSummaryEventually(
  [string]$visitorId,
  [scriptblock]$Predicate,
  [string]$FailureMessage,
  [int]$Attempts = 5,
  [int]$DelayMs = 500
) {
  $last = $null

  for ($i = 1; $i -le $Attempts; $i++) {
    $last = Get-IntegrationSummary $visitorId
    if (& $Predicate $last) {
      return $last
    }

    if ($i -lt $Attempts) {
      Start-Sleep -Milliseconds $DelayMs
    }
  }

  if ($null -ne $last) {
    Write-Host "[assert-integration-summary-smoke] Final summary on failure:" -ForegroundColor Yellow
    $last | ConvertTo-Json -Depth 20 | Write-Host
  }

  throw $FailureMessage
}

function Post-FollowupAssigned([string]$visitorId, [string]$assigneeId) {
  $evt = @{
    v          = 1
    eventId    = [guid]::NewGuid().ToString()
    visitorId  = $visitorId
    type       = "FOLLOWUP_ASSIGNED"
    occurredAt = (Get-Date).ToUniversalTime().ToString("o")
    source     = @{ system = "assert-integration-summary-smoke" }
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

Write-Host "=== INTEGRATION SUMMARY SMOKE ASSERT (v1) ===" -ForegroundColor Cyan

$visitorId = New-Visitor "Integration Summary Smoke"
Write-Host "visitorId=$visitorId" -ForegroundColor DarkGray

$baseline = Get-IntegrationSummary $visitorId

Assert ($baseline.v -eq 1) "expected baseline v=1"
Assert ($baseline.summary -ne $null) "expected baseline summary"
Assert ($baseline.summary.needsFollowup -eq $true) "expected baseline needsFollowup=true before engagement exists"
Assert ($baseline.summary.followupReason -eq "no_engagement_yet") "expected baseline followupReason='no_engagement_yet'"
Assert (-not (Has-Prop $baseline.summary "assignedTo")) "expected baseline assignedTo absent"
Assert ($baseline.summary.sources.formation -eq $false) "expected baseline sources.formation=false"
Assert (Has-Prop $baseline.summary "workflows") "expected baseline workflows present when needsFollowup=true"
Assert ($baseline.summary.workflows[0].workflowId -eq "followup") "expected baseline workflowId='followup'"

$assigneeId = "ops-user-1"
Post-FollowupAssigned -visitorId $visitorId -assigneeId $assigneeId

$after = Get-IntegrationSummaryEventually `
  -visitorId $visitorId `
  -Predicate {
    param($s)
    ($s.v -eq 1) -and
    ($s.summary -ne $null) -and
    (Has-Prop $s.summary "assignedTo") -and
    ($s.summary.assignedTo.ownerId -eq $assigneeId) -and
    ($s.summary.followupReason -eq "FOLLOWUP_ASSIGNED") -and
    (Has-Prop $s.summary "workflows") -and
    ($s.summary.workflows[0].workflowId -eq "followup")
  } `
  -FailureMessage "post-event integration summary did not reflect assigned follow-up workflow state in time"

Assert ($after.v -eq 1) "expected post-event v=1"
Assert ($after.summary -ne $null) "expected post-event summary"
Assert (Has-Prop $after.summary "assignedTo") "expected post-event assignedTo present"
Assert ($after.summary.assignedTo.ownerId -eq $assigneeId) "expected assignedTo.ownerId='$assigneeId' but got '$($after.summary.assignedTo.ownerId)'"
Assert ($after.summary.assignedTo.ownerType -eq "user") "expected assignedTo.ownerType='user'"
Assert ($after.summary.needsFollowup -eq $true) "expected post-event needsFollowup=true"
Assert ($after.summary.followupReason -eq "FOLLOWUP_ASSIGNED") "expected post-event followupReason='FOLLOWUP_ASSIGNED'"
Assert (Has-Prop $after.summary "workflows") "expected post-event workflows present when follow-up is active"
Assert ($after.summary.workflows[0].workflowId -eq "followup") "expected post-event workflowId='followup'"

Write-Host "OK: Integration summary smoke assertions passed. visitorId=$visitorId ownerId=$assigneeId" -ForegroundColor Green