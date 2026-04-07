param(
  [string]$BaseUrl = "http://localhost:7071",
  [string]$ApiKey = $env:HOPE_API_KEY
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

Write-Host "Running follow-up progression invariants..."

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
    source = @{ system = "assert-followup-progression-invariants" }
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

# Scenario A: valid follow-up progression
$visitorId = Create-TestVisitor "Followup Progression"
$base = (Get-Date).ToUniversalTime().AddMinutes(-5)

Write-Host "[scenario A] posting valid follow-up progression"
Post-FormationEvent -VisitorId $visitorId -Type "FOLLOWUP_ASSIGNED" -Data @{ assigneeId = "ops-user-1" } -OccurredAt $base
Start-Sleep -Milliseconds 50
Post-FormationEvent -VisitorId $visitorId -Type "FOLLOWUP_CONTACTED" -Data @{ method = "phone" } -OccurredAt $base.AddSeconds(1)
Start-Sleep -Milliseconds 50
Post-FormationEvent -VisitorId $visitorId -Type "FOLLOWUP_OUTCOME_RECORDED" -Data @{ outcome = "connected" } -OccurredAt $base.AddSeconds(2)

$summary = Get-VisitorSummary -VisitorId $visitorId
$journey = Get-VisitorJourney -VisitorId $visitorId

Write-Host "[debug] summary:"
$summary | ConvertTo-Json -Depth 6 | Write-Host

Write-Host "[debug] journey:"
$journey | ConvertTo-Json -Depth 6 | Write-Host

$summaryJourney = Read-JourneyStep $summary
$journeyStep = Read-JourneyStep $journey

Assert ($summaryJourney -eq "ENGAGED") "expected summary journey ENGAGED after follow-up lifecycle; got '$summaryJourney'"
Assert ($journeyStep -eq "ENGAGED") "expected journey endpoint ENGAGED after follow-up lifecycle; got '$journeyStep'"

Write-Host "Follow-up progression invariants passed."
