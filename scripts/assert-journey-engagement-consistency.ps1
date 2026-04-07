param(
  [string]$BaseUrl = "http://localhost:7071",
  [string]$ApiKey = $env:HOPE_API_KEY
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

Write-Host "Running journey vs engagement consistency invariant..."

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

function Post-Transition(
  [string]$VisitorId,
  [string]$From,
  [string]$To,
  [datetime]$OccurredAt
) {
  $event = @{
    v = 1
    eventId = "evt-$([guid]::NewGuid().ToString('N'))"
    visitorId = $VisitorId
    type = "status.transition"
    occurredAt = $OccurredAt.ToUniversalTime().ToString("o")
    source = @{ system = "assert-journey-engagement-consistency" }
    data = @{
      from = $From
      to   = $To
    }
  } | ConvertTo-Json -Depth 10

  $response = Invoke-RestMethod `
    -Method POST `
    -Uri "$BaseUrl/api/engagements/events" `
    -Headers (Get-Headers) `
    -ContentType "application/json" `
    -Body $event

  Write-Host "[debug] posted: $From -> $To :: ok=$($response.ok)"
}

function Get-EngagementStatus([string]$VisitorId) {
  Invoke-RestMethod `
    -Method GET `
    -Uri "$BaseUrl/api/engagements/status?visitorId=$([Uri]::EscapeDataString($VisitorId))" `
    -Headers (Get-Headers)
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

function Read-StatusValue($Body) {
  if ($null -eq $Body) { return $null }

  if ($Body.PSObject.Properties.Name -contains "status") {
    return [string]$Body.status
  }

  if ($Body.PSObject.Properties.Name -contains "currentStatus") {
    return [string]$Body.currentStatus
  }

  if (($Body.PSObject.Properties.Name -contains "data") -and $null -ne $Body.data) {
    if ($Body.data.PSObject.Properties.Name -contains "status") {
      return [string]$Body.data.status
    }

    if ($Body.data.PSObject.Properties.Name -contains "currentStatus") {
      return [string]$Body.data.currentStatus
    }
  }

  return $null
}

function Read-SummaryEngagementStatus($SummaryBody) {
  if ($null -eq $SummaryBody) { return $null }

  if (($SummaryBody.PSObject.Properties.Name -contains "summary") -and $null -ne $SummaryBody.summary) {
    $summary = $SummaryBody.summary
    if (($summary.PSObject.Properties.Name -contains "engagement") -and $null -ne $summary.engagement) {
      $engagement = $summary.engagement

      if ($engagement.PSObject.Properties.Name -contains "status") {
        return [string]$engagement.status
      }

      if ($engagement.PSObject.Properties.Name -contains "currentStatus") {
        return [string]$engagement.currentStatus
      }
    }
  }

  return $null
}

function Read-SummaryJourneyStep($SummaryBody) {
  if ($null -eq $SummaryBody) { return $null }

  if (($SummaryBody.PSObject.Properties.Name -contains "summary") -and $null -ne $SummaryBody.summary) {
    $summary = $SummaryBody.summary
    if (($summary.PSObject.Properties.Name -contains "journey") -and $null -ne $summary.journey) {
      $journey = $summary.journey

      if ($journey.PSObject.Properties.Name -contains "currentStep") {
        return [string]$journey.currentStep
      }
    }
  }

  return $null
}

function Read-JourneyStep($JourneyBody) {
  if ($null -eq $JourneyBody) { return $null }

  if ($JourneyBody.PSObject.Properties.Name -contains "currentStep") {
    return [string]$JourneyBody.currentStep
  }

  if (($JourneyBody.PSObject.Properties.Name -contains "journey") -and $null -ne $JourneyBody.journey) {
    if ($JourneyBody.journey.PSObject.Properties.Name -contains "currentStep") {
      return [string]$JourneyBody.journey.currentStep
    }
  }

  if (($JourneyBody.PSObject.Properties.Name -contains "data") -and $null -ne $JourneyBody.data) {
    if ($JourneyBody.data.PSObject.Properties.Name -contains "currentStep") {
      return [string]$JourneyBody.data.currentStep
    }
  }

  return $null
}

# Scenario A: engaged visitor
$engagedVisitorId = Create-TestVisitor "Journey Engagement Consistency"
$base = (Get-Date).ToUniversalTime().AddMinutes(-5)

Write-Host "[scenario A] posting valid engagement transitions"
Post-Transition -VisitorId $engagedVisitorId -From "NEW" -To "ENGAGED" -OccurredAt $base
Start-Sleep -Milliseconds 50
Post-Transition -VisitorId $engagedVisitorId -From "ENGAGED" -To "DISENGAGED" -OccurredAt $base.AddSeconds(1)
Start-Sleep -Milliseconds 50
Post-Transition -VisitorId $engagedVisitorId -From "DISENGAGED" -To "ENGAGED" -OccurredAt $base.AddSeconds(2)

$engagementStatusA = Get-EngagementStatus -VisitorId $engagedVisitorId
$summaryA = Get-VisitorSummary -VisitorId $engagedVisitorId
$journeyA = Get-VisitorJourney -VisitorId $engagedVisitorId

$statusA = Read-StatusValue $engagementStatusA
$summaryStatusA = Read-SummaryEngagementStatus $summaryA
$summaryJourneyA = Read-SummaryJourneyStep $summaryA
$journeyStepA = Read-JourneyStep $journeyA

Write-Host "[debug] scenario A engagement status:"
$engagementStatusA | ConvertTo-Json -Depth 6 | Write-Host

Write-Host "[debug] scenario A summary:"
$summaryA | ConvertTo-Json -Depth 6 | Write-Host

Write-Host "[debug] scenario A journey:"
$journeyA | ConvertTo-Json -Depth 6 | Write-Host

Assert ($statusA -eq "ENGAGED") "scenario A expected engagement status ENGAGED; got '$statusA'"
Assert ($summaryStatusA -eq "ENGAGED") "scenario A expected summary engagement status ENGAGED; got '$summaryStatusA'"
Assert ($summaryJourneyA -eq "ENGAGED") "scenario A expected summary journey ENGAGED; got '$summaryJourneyA'"
Assert ($journeyStepA -eq "ENGAGED") "scenario A expected journey endpoint ENGAGED; got '$journeyStepA'"

# Scenario B: no engagement
$newVisitorId = Create-TestVisitor "Journey New Consistency"

$engagementStatusB = Get-EngagementStatus -VisitorId $newVisitorId
$summaryB = Get-VisitorSummary -VisitorId $newVisitorId
$journeyB = Get-VisitorJourney -VisitorId $newVisitorId

$statusB = Read-StatusValue $engagementStatusB
$summaryStatusB = Read-SummaryEngagementStatus $summaryB
$summaryJourneyB = Read-SummaryJourneyStep $summaryB
$journeyStepB = Read-JourneyStep $journeyB

Write-Host "[debug] scenario B engagement status:"
$engagementStatusB | ConvertTo-Json -Depth 6 | Write-Host

Write-Host "[debug] scenario B summary:"
$summaryB | ConvertTo-Json -Depth 6 | Write-Host

Write-Host "[debug] scenario B journey:"
$journeyB | ConvertTo-Json -Depth 6 | Write-Host

Assert ([string]::IsNullOrWhiteSpace($statusB)) "scenario B expected null/empty engagement status; got '$statusB'"
Assert ([string]::IsNullOrWhiteSpace($summaryStatusB)) "scenario B expected null/empty summary engagement status; got '$summaryStatusB'"
Assert ($summaryJourneyB -eq "NEW") "scenario B expected summary journey NEW; got '$summaryJourneyB'"
Assert ($journeyStepB -eq "NEW") "scenario B expected journey endpoint NEW; got '$journeyStepB'"

Write-Host "Journey vs engagement consistency invariant passed."
