param(
  [string]$ApiBase = "http://127.0.0.1:7071/api",
  [string]$ApiKey = $env:HOPE_API_KEY
)

$ErrorActionPreference = "Stop"

if ([string]::IsNullOrWhiteSpace($ApiKey)) {
  throw "HOPE_API_KEY env var is required."
}

try {
  Invoke-WebRequest -Method GET -Uri "$ApiBase/health" -UseBasicParsing -TimeoutSec 5 | Out-Null
} catch {
  throw "API is not reachable at $ApiBase. Start Functions host first."
}

function Assert-True {
  param(
    [Parameter(Mandatory=$true)][bool]$Condition,
    [Parameter(Mandatory=$true)][string]$Message
  )

  if (-not $Condition) {
    throw $Message
  }
}

function New-Headers {
  return @{ "x-api-key" = $ApiKey }
}

function Post-Json {
  param(
    [Parameter(Mandatory=$true)][string]$Uri,
    [Parameter(Mandatory=$true)][object]$Body
  )

  Invoke-RestMethod `
    -Method POST `
    -Uri $Uri `
    -Headers (New-Headers) `
    -ContentType "application/json" `
    -Body ($Body | ConvertTo-Json -Depth 20)
}

function Get-Json {
  param([Parameter(Mandatory=$true)][string]$Uri)

  Invoke-RestMethod `
    -Method GET `
    -Uri $Uri `
    -Headers (New-Headers)
}

function To-IsoMillis {
  param($Value)

  if ($null -eq $Value) {
    return $null
  }

  return ([DateTimeOffset]::Parse([string]$Value).ToUniversalTime()).ToString("yyyy-MM-ddTHH:mm:ss.fffZ")
}

function New-Visitor {
  param([Parameter(Mandatory=$true)][string]$Tag)

  $body = @{
    name   = "journey-invariant-$Tag"
    email  = ("journey-" + $Tag + "-" + (Get-Date -Format "yyyyMMddHHmmssfff") + "@example.com")
    source = "assert-journey-derivation-invariants"
  }

  Post-Json -Uri "$ApiBase/visitors" -Body $body
}

function Post-EngagementEvent {
  param(
    [Parameter(Mandatory=$true)][string]$VisitorId,
    [Parameter(Mandatory=$true)][string]$OccurredAt,
    [string]$Type = "note.add"
  )

  $body = @{
    v          = 1
    eventId    = ("evt-" + [Guid]::NewGuid().ToString("N"))
    visitorId  = $VisitorId
    type       = $Type
    occurredAt = $OccurredAt
    source     = @{ system = "assert-journey-derivation-invariants"; actorId = "ops-user-1" }
    data       = @{
      text    = "journey invariant engagement"
      channel = "api"
    }
  }

  Post-Json -Uri "$ApiBase/engagements/events" -Body $body | Out-Null
}

function Post-FormationEvent {
  param(
    [Parameter(Mandatory=$true)][string]$VisitorId,
    [Parameter(Mandatory=$true)][string]$Type,
    [Parameter(Mandatory=$true)][string]$OccurredAt,
    [Parameter(Mandatory=$true)][hashtable]$Data
  )

  $body = @{
    v          = 1
    eventId    = ("fevt-" + [Guid]::NewGuid().ToString("N"))
    visitorId  = $VisitorId
    type       = $Type
    occurredAt = $OccurredAt
    source     = @{ system = "assert-journey-derivation-invariants"; actorId = "ops-user-1" }
    data       = $Data
  }

  Post-Json -Uri "$ApiBase/formation/events" -Body $body | Out-Null
}

function Get-FormationProfile {
  param([Parameter(Mandatory=$true)][string]$VisitorId)

  $profile = Get-Json -Uri "$ApiBase/visitors/$([Uri]::EscapeDataString($VisitorId))/formation/profile"

  Assert-True ([bool]$profile.ok) "Expected formation profile response ok=true for visitorId=$VisitorId"
  Assert-True ($null -ne $profile.profile) "Expected formation profile body for visitorId=$VisitorId"

  return $profile.profile
}

function Get-JourneyStepPair {
  param([Parameter(Mandatory=$true)][string]$VisitorId)

  $encodedVisitorId = [Uri]::EscapeDataString($VisitorId)

  $journey = Get-Json -Uri "$ApiBase/visitors/$encodedVisitorId/journey"
  $summary = Get-Json -Uri "$ApiBase/visitors/$encodedVisitorId/summary"

  $journeyStep = $journey.currentStep
  $summaryStep = $summary.summary.journey.currentStep

  Assert-True ($journeyStep -eq $summaryStep) "Expected /journey and /summary.journey to agree for visitorId=$VisitorId, got journey=$journeyStep summary=$summaryStep"

  @{
    Journey = $journey
    Summary = $summary
    Step    = $journeyStep
  }
}

function Assert-JourneyFormationProfileAligned {
  param(
    [Parameter(Mandatory=$true)][string]$VisitorId,
    [Parameter(Mandatory=$true)]$Journey,
    [Parameter(Mandatory=$true)]$Profile,
    [Parameter(Mandatory=$true)][string]$ExpectedLastEventType
  )

  Assert-True ([string]$Profile.lastEventType -eq $ExpectedLastEventType) "Expected formation profile lastEventType=$ExpectedLastEventType for visitorId=$VisitorId, got '$($Profile.lastEventType)'"

  $formationEvidence = @($Journey.evidence) |
    Where-Object { [string]$_.source -eq "formation" } |
    Select-Object -First 1

  Assert-True ($null -ne $formationEvidence) "Expected journey formation evidence for visitorId=$VisitorId"
  Assert-True ([string]$formationEvidence.eventType -eq [string]$Profile.lastEventType) "Expected journey formation evidence eventType to match profile lastEventType for visitorId=$VisitorId"
  Assert-True ((To-IsoMillis $formationEvidence.at) -eq (To-IsoMillis $Profile.lastEventAt)) "Expected journey formation evidence timestamp to match profile lastEventAt for visitorId=$VisitorId"
  Assert-True (@($Journey.sources) -contains "formation") "Expected journey sources to include formation for visitorId=$VisitorId"
}

Write-Host "[journey-invariants] test start"

$visitorNew = New-Visitor -Tag "baseline"
$pairNew = Get-JourneyStepPair -VisitorId $visitorNew.visitorId
Assert-True ($pairNew.Step -eq "NEW") "Expected baseline journey step NEW, got $($pairNew.Step)"
Write-Host "[journey-invariants] baseline NEW OK"

$visitorEngaged = New-Visitor -Tag "engaged"
$t0 = (Get-Date).ToUniversalTime()
Post-EngagementEvent -VisitorId $visitorEngaged.visitorId -OccurredAt $t0.ToString("o")
$pairEngaged = Get-JourneyStepPair -VisitorId $visitorEngaged.visitorId
Assert-True ($pairEngaged.Step -eq "ENGAGED") "Expected engagement-only journey step ENGAGED, got $($pairEngaged.Step)"
Write-Host "[journey-invariants] engagement ENGAGED OK"

$visitorResolved = New-Visitor -Tag "resolved"
$t1 = (Get-Date).ToUniversalTime()
Post-EngagementEvent -VisitorId $visitorResolved.visitorId -OccurredAt $t1.ToString("o")
Post-FormationEvent -VisitorId $visitorResolved.visitorId -Type "FOLLOWUP_ASSIGNED" -OccurredAt $t1.AddSeconds(1).ToString("o") -Data @{ assigneeId = "ops-user-journey" }
Post-FormationEvent -VisitorId $visitorResolved.visitorId -Type "FOLLOWUP_OUTCOME_RECORDED" -OccurredAt $t1.AddSeconds(2).ToString("o") -Data @{ outcome = "reached" }
$pairResolved = Get-JourneyStepPair -VisitorId $visitorResolved.visitorId
$profileResolved = Get-FormationProfile -VisitorId $visitorResolved.visitorId
Assert-JourneyFormationProfileAligned -VisitorId $visitorResolved.visitorId -Journey $pairResolved.Journey -Profile $profileResolved -ExpectedLastEventType "FOLLOWUP_OUTCOME_RECORDED"
Assert-True ($pairResolved.Step -eq "ENGAGED") "Expected resolved follow-up without formation promotion to remain ENGAGED, got $($pairResolved.Step)"
Write-Host "[journey-invariants] resolved follow-up stays ENGAGED OK"

$visitorForming = New-Visitor -Tag "forming"
$t2 = (Get-Date).ToUniversalTime()
Post-EngagementEvent -VisitorId $visitorForming.visitorId -OccurredAt $t2.ToString("o")
Post-FormationEvent -VisitorId $visitorForming.visitorId -Type "SALVATION_RECORDED" -OccurredAt $t2.AddSeconds(1).ToString("o") -Data @{
  method = "personal"
}
$pairForming = Get-JourneyStepPair -VisitorId $visitorForming.visitorId
$profileForming = Get-FormationProfile -VisitorId $visitorForming.visitorId
Assert-JourneyFormationProfileAligned -VisitorId $visitorForming.visitorId -Journey $pairForming.Journey -Profile $profileForming -ExpectedLastEventType "SALVATION_RECORDED"
Assert-True ($pairForming.Step -eq "FORMING") "Expected SALVATION_RECORDED to promote journey to FORMING, got $($pairForming.Step)"
Write-Host "[journey-invariants] salvation promotion to FORMING OK"

$visitorContacted = New-Visitor -Tag "contacted"
$t3 = (Get-Date).ToUniversalTime()
Post-EngagementEvent -VisitorId $visitorContacted.visitorId -OccurredAt $t3.ToString("o")
Post-FormationEvent -VisitorId $visitorContacted.visitorId -Type "FOLLOWUP_CONTACTED" -OccurredAt $t3.AddSeconds(1).ToString("o") -Data @{
  method = "sms"
  result = "reached"
}
$pairContacted = Get-JourneyStepPair -VisitorId $visitorContacted.visitorId
$profileContacted = Get-FormationProfile -VisitorId $visitorContacted.visitorId
Assert-JourneyFormationProfileAligned -VisitorId $visitorContacted.visitorId -Journey $pairContacted.Journey -Profile $profileContacted -ExpectedLastEventType "FOLLOWUP_CONTACTED"
Assert-True ($pairContacted.Step -eq "ENGAGED") "Expected contacted follow-up to remain ENGAGED (current contract), got $($pairContacted.Step)"
Write-Host "[journey-invariants] contacted follow-up stays ENGAGED (baseline) OK"

Write-Host "[journey-invariants] ALL OK"
