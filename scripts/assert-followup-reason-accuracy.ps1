param(
  [string]$BaseUrl = "http://localhost:7071",
  [string]$ApiKey = $env:HOPE_API_KEY
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

Write-Host "Running follow-up reason accuracy invariant..."

function Get-Headers {
  if ([string]::IsNullOrWhiteSpace($ApiKey)) {
    throw "HOPE_API_KEY required"
  }

  return @{ "x-api-key" = $ApiKey }
}

function Assert([bool]$Condition, [string]$Message) {
  if (-not $Condition) {
    throw $Message
  }
}

function Create-TestVisitor([string]$NamePrefix) {
  $response = Invoke-RestMethod `
    -Method POST `
    -Uri "$BaseUrl/api/visitors" `
    -ContentType "application/json" `
    -Body (@{
      name  = "$NamePrefix $([guid]::NewGuid().ToString('N').Substring(0,8))"
      email = "$($NamePrefix.ToLower().Replace(' ','-'))+$([guid]::NewGuid().ToString('N'))@test.com"
    } | ConvertTo-Json)

  $visitorId = [string]$response.visitorId
  Assert (-not [string]::IsNullOrWhiteSpace($visitorId)) "visitorId missing from create visitor response"
  return $visitorId
}

function Post-FormationEvent(
  [string]$VisitorId,
  [string]$Type,
  [hashtable]$Data,
  [datetime]$OccurredAt
) {
  $event = @{
    v = 1
    eventId = "evt-$([guid]::NewGuid().ToString('N'))"
    visitorId = $VisitorId
    type = $Type
    occurredAt = $OccurredAt.ToUniversalTime().ToString("o")
    source = @{ system = "assert-followup-reason-accuracy" }
    data = $Data
  } | ConvertTo-Json -Depth 10

  $response = Invoke-RestMethod `
    -Method POST `
    -Uri "$BaseUrl/api/formation/events" `
    -Headers (Get-Headers) `
    -ContentType "application/json" `
    -Body $event

  Write-Host "[debug] posted formation event: $Type :: ok=$($response.ok)"
}

function Get-VisitorSummary([string]$VisitorId) {
  Invoke-RestMethod `
    -Method GET `
    -Uri "$BaseUrl/api/visitors/$([Uri]::EscapeDataString($VisitorId))/summary" `
    -Headers (Get-Headers)
}

function Read-FollowupReason($SummaryBody) {
  if ($null -eq $SummaryBody) { return $null }

  if (($SummaryBody.PSObject.Properties.Name -contains "summary") -and $null -ne $SummaryBody.summary) {
    if (($SummaryBody.summary.PSObject.Properties.Name -contains "integration") -and $null -ne $SummaryBody.summary.integration) {
      return [string]$SummaryBody.summary.integration.followupReason
    }
  }

  return $null
}

# Scenario A: assigned only
$visitorA = Create-TestVisitor "Followup Reason Assigned"
$baseA = (Get-Date).ToUniversalTime().AddMinutes(-5)

Write-Host "[scenario A] posting assigned only"
Post-FormationEvent -VisitorId $visitorA -Type "FOLLOWUP_ASSIGNED" -Data @{ assigneeId = "ops-user-1" } -OccurredAt $baseA
$summaryA = Get-VisitorSummary -VisitorId $visitorA
$reasonA = Read-FollowupReason $summaryA
Write-Host "[debug] scenario A summary:"
$summaryA | ConvertTo-Json -Depth 6 | Write-Host
Assert ($reasonA -eq "FOLLOWUP_ASSIGNED") "scenario A expected FOLLOWUP_ASSIGNED; got '$reasonA'"

# Scenario B: assigned then contacted
$visitorB = Create-TestVisitor "Followup Reason Contacted"
$baseB = (Get-Date).ToUniversalTime().AddMinutes(-5)

Write-Host "[scenario B] posting assigned then contacted"
Post-FormationEvent -VisitorId $visitorB -Type "FOLLOWUP_ASSIGNED" -Data @{ assigneeId = "ops-user-2" } -OccurredAt $baseB
Start-Sleep -Milliseconds 50
Post-FormationEvent -VisitorId $visitorB -Type "FOLLOWUP_CONTACTED" -Data @{ method = "phone" } -OccurredAt $baseB.AddSeconds(1)
$summaryB = Get-VisitorSummary -VisitorId $visitorB
$reasonB = Read-FollowupReason $summaryB
Write-Host "[debug] scenario B summary:"
$summaryB | ConvertTo-Json -Depth 6 | Write-Host
Assert ($reasonB -eq "FOLLOWUP_CONTACTED") "scenario B expected FOLLOWUP_CONTACTED; got '$reasonB'"

# Scenario C: assigned then contacted then outcome
$visitorC = Create-TestVisitor "Followup Reason Outcome"
$baseC = (Get-Date).ToUniversalTime().AddMinutes(-5)

Write-Host "[scenario C] posting assigned then contacted then outcome"
Post-FormationEvent -VisitorId $visitorC -Type "FOLLOWUP_ASSIGNED" -Data @{ assigneeId = "ops-user-3" } -OccurredAt $baseC
Start-Sleep -Milliseconds 50
Post-FormationEvent -VisitorId $visitorC -Type "FOLLOWUP_CONTACTED" -Data @{ method = "phone" } -OccurredAt $baseC.AddSeconds(1)
Start-Sleep -Milliseconds 50
Post-FormationEvent -VisitorId $visitorC -Type "FOLLOWUP_OUTCOME_RECORDED" -Data @{ outcome = "connected" } -OccurredAt $baseC.AddSeconds(2)
$summaryC = Get-VisitorSummary -VisitorId $visitorC
$reasonC = Read-FollowupReason $summaryC
Write-Host "[debug] scenario C summary:"
$summaryC | ConvertTo-Json -Depth 6 | Write-Host
Assert ($reasonC -eq "FOLLOWUP_OUTCOME_RECORDED") "scenario C expected FOLLOWUP_OUTCOME_RECORDED; got '$reasonC'"

Write-Host "Follow-up reason accuracy invariant passed."
