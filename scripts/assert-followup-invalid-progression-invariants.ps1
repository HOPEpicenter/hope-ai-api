param(
  [string]$BaseUrl = "http://localhost:7071",
  [string]$ApiKey = $env:HOPE_API_KEY
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

Write-Host "Running invalid follow-up progression invariants..."

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
    source = @{ system = "assert-followup-invalid-progression-invariants" }
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

function Get-VisitorJourney([string]$VisitorId) {
  Invoke-RestMethod `
    -Method GET `
    -Uri "$BaseUrl/api/visitors/$([Uri]::EscapeDataString($VisitorId))/journey" `
    -Headers (Get-Headers)
}

function Read-JourneyStep($Body) {
  if ($null -eq $Body) { return $null }

  if ($Body.PSObject.Properties.Name -contains "currentStep") {
    return [string]$Body.currentStep
  }

  if (($Body.PSObject.Properties.Name -contains "summary") -and $null -ne $Body.summary) {
    if (($Body.summary.PSObject.Properties.Name -contains "journey") -and $null -ne $Body.summary.journey) {
      if ($Body.summary.journey.PSObject.Properties.Name -contains "currentStep") {
        return [string]$Body.summary.journey.currentStep
      }
    }
  }

  return $null
}

function Read-FollowupReason($SummaryBody) {
  if ($null -eq $SummaryBody) { return $null }

  if (($SummaryBody.PSObject.Properties.Name -contains "summary") -and $null -ne $SummaryBody.summary) {
    $summary = $SummaryBody.summary
    if (($summary.PSObject.Properties.Name -contains "integration") -and $null -ne $summary.integration) {
      $integration = $summary.integration
      if ($integration.PSObject.Properties.Name -contains "followupReason") {
        return [string]$integration.followupReason
      }
    }
  }

  return $null
}

function Read-TimelinePreview($SummaryBody) {
  if ($null -eq $SummaryBody) { return @() }

  if (($SummaryBody.PSObject.Properties.Name -contains "summary") -and $null -ne $SummaryBody.summary) {
    $summary = $SummaryBody.summary
    if (($summary.PSObject.Properties.Name -contains "engagement") -and $null -ne $summary.engagement) {
      $engagement = $summary.engagement
      if ($engagement.PSObject.Properties.Name -contains "timelinePreview" -and $null -ne $engagement.timelinePreview) {
        return @($engagement.timelinePreview)
      }
    }
  }

  return @()
}

# Scenario A: contacted before assigned
$visitorA = Create-TestVisitor "Followup Invalid Contacted First"
$baseA = (Get-Date).ToUniversalTime().AddMinutes(-5)

Write-Host "[scenario A] posting invalid follow-up ordering: CONTACTED before ASSIGNED"
Post-FormationEvent -VisitorId $visitorA -Type "FOLLOWUP_CONTACTED" -Data @{ method = "phone" } -OccurredAt $baseA
Start-Sleep -Milliseconds 50
Post-FormationEvent -VisitorId $visitorA -Type "FOLLOWUP_ASSIGNED" -Data @{ assigneeId = "ops-user-1" } -OccurredAt $baseA.AddSeconds(1)

$summaryA = Get-VisitorSummary -VisitorId $visitorA
$journeyA = Get-VisitorJourney -VisitorId $visitorA

Write-Host "[debug] scenario A summary:"
$summaryA | ConvertTo-Json -Depth 6 | Write-Host

Write-Host "[debug] scenario A journey:"
$journeyA | ConvertTo-Json -Depth 6 | Write-Host

$summaryJourneyA = Read-JourneyStep $summaryA
$journeyStepA = Read-JourneyStep $journeyA
$timelineA = Read-TimelinePreview $summaryA

Assert ($summaryJourneyA -eq "ENGAGED") "scenario A expected summary journey ENGAGED; got '$summaryJourneyA'"
Assert ($journeyStepA -eq "ENGAGED") "scenario A expected journey endpoint ENGAGED; got '$journeyStepA'"
Assert ($timelineA.Count -ge 2) "scenario A expected raw timeline preview to retain invalid ordering evidence"

# Scenario B: outcome before assigned
$visitorB = Create-TestVisitor "Followup Invalid Outcome First"
$baseB = (Get-Date).ToUniversalTime().AddMinutes(-5)

Write-Host "[scenario B] posting invalid follow-up ordering: OUTCOME before ASSIGNED"
Post-FormationEvent -VisitorId $visitorB -Type "FOLLOWUP_OUTCOME_RECORDED" -Data @{ outcome = "connected" } -OccurredAt $baseB
Start-Sleep -Milliseconds 50
Post-FormationEvent -VisitorId $visitorB -Type "FOLLOWUP_ASSIGNED" -Data @{ assigneeId = "ops-user-1" } -OccurredAt $baseB.AddSeconds(1)

$summaryB = Get-VisitorSummary -VisitorId $visitorB
$journeyB = Get-VisitorJourney -VisitorId $visitorB

Write-Host "[debug] scenario B summary:"
$summaryB | ConvertTo-Json -Depth 6 | Write-Host

Write-Host "[debug] scenario B journey:"
$journeyB | ConvertTo-Json -Depth 6 | Write-Host

$summaryJourneyB = Read-JourneyStep $summaryB
$journeyStepB = Read-JourneyStep $journeyB
$timelineB = Read-TimelinePreview $summaryB

Assert ($summaryJourneyB -eq "ENGAGED") "scenario B expected summary journey ENGAGED; got '$summaryJourneyB'"
Assert ($journeyStepB -eq "ENGAGED") "scenario B expected journey endpoint ENGAGED; got '$journeyStepB'"
Assert ($timelineB.Count -ge 2) "scenario B expected raw timeline preview to retain invalid ordering evidence"

Write-Host "Invalid follow-up progression invariants passed."
