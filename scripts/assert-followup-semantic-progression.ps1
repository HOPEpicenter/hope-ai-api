param(
  [string]$BaseUrl = "http://localhost:7071",
  [string]$ApiKey = $env:HOPE_API_KEY
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

Write-Host "Running follow-up semantic progression invariant..."

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
    source = @{ system = "assert-followup-semantic-progression" }
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

function Read-FormationProfile($SummaryBody) {
  if ($null -eq $SummaryBody) { return $null }

  if (($SummaryBody.PSObject.Properties.Name -contains "summary") -and $null -ne $SummaryBody.summary) {
    if (($SummaryBody.summary.PSObject.Properties.Name -contains "formation") -and $null -ne $SummaryBody.summary.formation) {
      return $SummaryBody.summary.formation.profile
    }
  }

  return $null
}

# Scenario A: assigned only
$visitorA = Create-TestVisitor "Followup Semantic Assigned"
$baseA = (Get-Date).ToUniversalTime().AddMinutes(-5)

Write-Host "[scenario A] posting assigned only"
Post-FormationEvent -VisitorId $visitorA -Type "FOLLOWUP_ASSIGNED" -Data @{ assigneeId = "ops-user-1" } -OccurredAt $baseA

$summaryA = Get-VisitorSummary -VisitorId $visitorA
$journeyA = Get-VisitorJourney -VisitorId $visitorA
$profileA = Read-FormationProfile $summaryA
$journeyStepA = Read-JourneyStep $journeyA

Write-Host "[debug] scenario A summary:"
$summaryA | ConvertTo-Json -Depth 6 | Write-Host

Assert ($journeyStepA -eq "ENGAGED") "scenario A expected journey ENGAGED; got '$journeyStepA'"
Assert ($null -ne $profileA) "scenario A expected formation profile"
Assert ([string]$profileA.lastEventType -eq "FOLLOWUP_ASSIGNED") "scenario A expected lastEventType FOLLOWUP_ASSIGNED; got '$($profileA.lastEventType)'"
Assert ([string]$profileA.assignedTo -eq "ops-user-1") "scenario A expected assignedTo ops-user-1; got '$($profileA.assignedTo)'"

# Scenario B: assigned then contacted
$visitorB = Create-TestVisitor "Followup Semantic Contacted"
$baseB = (Get-Date).ToUniversalTime().AddMinutes(-5)

Write-Host "[scenario B] posting assigned then contacted"
Post-FormationEvent -VisitorId $visitorB -Type "FOLLOWUP_ASSIGNED" -Data @{ assigneeId = "ops-user-2" } -OccurredAt $baseB
Start-Sleep -Milliseconds 50
Post-FormationEvent -VisitorId $visitorB -Type "FOLLOWUP_CONTACTED" -Data @{ method = "phone" } -OccurredAt $baseB.AddSeconds(1)

$summaryB = Get-VisitorSummary -VisitorId $visitorB
$journeyB = Get-VisitorJourney -VisitorId $visitorB
$profileB = Read-FormationProfile $summaryB
$journeyStepB = Read-JourneyStep $journeyB

Write-Host "[debug] scenario B summary:"
$summaryB | ConvertTo-Json -Depth 6 | Write-Host

Assert ($journeyStepB -eq "ENGAGED") "scenario B expected journey ENGAGED; got '$journeyStepB'"
Assert ($null -ne $profileB) "scenario B expected formation profile"
Assert ([string]$profileB.lastEventType -eq "FOLLOWUP_CONTACTED") "scenario B expected lastEventType FOLLOWUP_CONTACTED; got '$($profileB.lastEventType)'"
Assert (-not [string]::IsNullOrWhiteSpace([string]$profileB.lastFollowupContactedAt)) "scenario B expected lastFollowupContactedAt"

# Scenario C: assigned then contacted then outcome
$visitorC = Create-TestVisitor "Followup Semantic Outcome"
$baseC = (Get-Date).ToUniversalTime().AddMinutes(-5)

Write-Host "[scenario C] posting assigned then contacted then outcome"
Post-FormationEvent -VisitorId $visitorC -Type "FOLLOWUP_ASSIGNED" -Data @{ assigneeId = "ops-user-3" } -OccurredAt $baseC
Start-Sleep -Milliseconds 50
Post-FormationEvent -VisitorId $visitorC -Type "FOLLOWUP_CONTACTED" -Data @{ method = "phone" } -OccurredAt $baseC.AddSeconds(1)
Start-Sleep -Milliseconds 50
Post-FormationEvent -VisitorId $visitorC -Type "FOLLOWUP_OUTCOME_RECORDED" -Data @{ outcome = "connected" } -OccurredAt $baseC.AddSeconds(2)

$summaryC = Get-VisitorSummary -VisitorId $visitorC
$journeyC = Get-VisitorJourney -VisitorId $visitorC
$profileC = Read-FormationProfile $summaryC
$journeyStepC = Read-JourneyStep $journeyC

Write-Host "[debug] scenario C summary:"
$summaryC | ConvertTo-Json -Depth 6 | Write-Host

Assert ($journeyStepC -eq "ENGAGED") "scenario C expected journey ENGAGED; got '$journeyStepC'"
Assert ($null -ne $profileC) "scenario C expected formation profile"
Assert ([string]$profileC.lastEventType -eq "FOLLOWUP_OUTCOME_RECORDED") "scenario C expected lastEventType FOLLOWUP_OUTCOME_RECORDED; got '$($profileC.lastEventType)'"
Assert ([string]$profileC.lastFollowupOutcome -eq "connected") "scenario C expected lastFollowupOutcome connected; got '$($profileC.lastFollowupOutcome)'"
Assert (-not [string]::IsNullOrWhiteSpace([string]$profileC.lastFollowupOutcomeAt)) "scenario C expected lastFollowupOutcomeAt"

Write-Host "Follow-up semantic progression invariant passed."
