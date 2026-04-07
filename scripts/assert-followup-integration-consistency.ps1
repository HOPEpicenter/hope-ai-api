param(
  [string]$BaseUrl = "http://localhost:7071",
  [string]$ApiKey = $env:HOPE_API_KEY
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

Write-Host "Running follow-up integration consistency invariant..."

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
    source = @{ system = "assert-followup-integration-consistency" }
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

function Read-FormationProfile($SummaryBody) {
  if ($null -eq $SummaryBody) { return $null }

  if (($SummaryBody.PSObject.Properties.Name -contains "summary") -and $null -ne $SummaryBody.summary) {
    if (($SummaryBody.summary.PSObject.Properties.Name -contains "formation") -and $null -ne $SummaryBody.summary.formation) {
      return $SummaryBody.summary.formation.profile
    }
  }

  return $null
}

function Read-Integration($SummaryBody) {
  if ($null -eq $SummaryBody) { return $null }

  if (($SummaryBody.PSObject.Properties.Name -contains "summary") -and $null -ne $SummaryBody.summary) {
    if (($SummaryBody.summary.PSObject.Properties.Name -contains "integration") -and $null -ne $SummaryBody.summary.integration) {
      return $SummaryBody.summary.integration
    }
  }

  return $null
}

$visitorId = Create-TestVisitor "Followup Integration Consistency"
$base = (Get-Date).ToUniversalTime().AddMinutes(-5)

Write-Host "[test] posting follow-up events"
Post-FormationEvent -VisitorId $visitorId -Type "FOLLOWUP_ASSIGNED" -Data @{ assigneeId = "ops-user-1" } -OccurredAt $base
Start-Sleep -Milliseconds 50
Post-FormationEvent -VisitorId $visitorId -Type "FOLLOWUP_CONTACTED" -Data @{ method = "phone" } -OccurredAt $base.AddSeconds(1)
Start-Sleep -Milliseconds 50
Post-FormationEvent -VisitorId $visitorId -Type "FOLLOWUP_OUTCOME_RECORDED" -Data @{ outcome = "connected" } -OccurredAt $base.AddSeconds(2)

$summary = Get-VisitorSummary -VisitorId $visitorId
$profile = Read-FormationProfile $summary
$integration = Read-Integration $summary

Write-Host "[debug] summary:"
$summary | ConvertTo-Json -Depth 6 | Write-Host

Assert ($null -ne $profile) "expected formation profile to exist"
Assert ($null -ne $integration) "expected integration summary to exist"
Assert ($integration.sources.formation -eq $true) "expected integration.sources.formation = true"
Assert (-not [string]::IsNullOrWhiteSpace([string]$integration.lastFormationAt)) "expected integration.lastFormationAt to be populated"

Write-Host "Follow-up integration consistency invariant passed."
