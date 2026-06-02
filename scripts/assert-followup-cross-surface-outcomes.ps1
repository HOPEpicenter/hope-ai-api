param(
  [string]$BaseUrl = "http://127.0.0.1:7071",
  [string]$ApiKey = $env:HOPE_API_KEY
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

$ApiBase = ($BaseUrl.TrimEnd("/") + "/api")
$OpsBase = ($BaseUrl.TrimEnd("/") + "/api")

$headers = @{
  "content-type" = "application/json"
}

if (-not [string]::IsNullOrWhiteSpace($ApiKey)) {
  $headers["x-api-key"] = $ApiKey
}

function Assert([bool]$Condition, [string]$Message) {
  if (-not $Condition) {
    throw "ASSERT FAILED: $Message"
  }
}

function To-JsonBody($Body) {
  $Body | ConvertTo-Json -Depth 30
}

function Json-Get([string]$Url) {
  Invoke-RestMethod -Method GET -Uri $Url -Headers $headers
}

function Json-Post([string]$Url, [hashtable]$Body) {
  Invoke-RestMethod -Method POST -Uri $Url -Headers $headers -ContentType "application/json" -Body (To-JsonBody $Body)
}

function New-EventId([string]$Prefix) {
  "$Prefix-$([guid]::NewGuid().ToString('N'))"
}

function New-IsoUtc([datetime]$Value) {
  $Value.ToUniversalTime().ToString("o")
}

function Create-TestVisitor([string]$Label) {
  $visitor = Json-Post "$ApiBase/visitors" @{
    name = "Cross Surface Outcome $Label $([guid]::NewGuid().ToString('N').Substring(0,8))"
    email = "cross-surface-outcome-$($Label.ToLower().Replace('_','-'))+$([guid]::NewGuid().ToString('N'))@example.com"
    source = "assert-followup-cross-surface-outcomes.ps1"
  }

  Assert (-not [string]::IsNullOrWhiteSpace([string]$visitor.visitorId)) "visitorId should be returned for $Label"
  return [string]$visitor.visitorId
}

function Post-FormationEvent(
  [string]$VisitorId,
  [string]$Type,
  [datetime]$OccurredAt,
  [hashtable]$Data
) {
  Json-Post "$ApiBase/formation/events" @{
    v = 1
    eventId = New-EventId "evt-cross-surface-outcome"
    visitorId = $VisitorId
    type = $Type
    occurredAt = New-IsoUtc $OccurredAt
    source = @{
      system = "assert-followup-cross-surface-outcomes"
      actorId = "ops-user-1"
    }
    data = $Data
  } | Out-Null
}

function Get-FormationProfile([string]$VisitorId) {
  $response = Json-Get "$ApiBase/visitors/$([Uri]::EscapeDataString($VisitorId))/formation/profile"
  return $response.profile
}

function Get-IntegrationSummary([string]$VisitorId) {
  $summary = Json-Get "$ApiBase/visitors/$([Uri]::EscapeDataString($VisitorId))/summary"
  return $summary.summary.integration
}

function Get-ItemByVisitorId($Items, [string]$VisitorId) {
  @($Items) | Where-Object { [string]$_.visitorId -eq $VisitorId } | Select-Object -First 1
}

function Assert-OutcomeScenario(
  [string]$Outcome,
  [bool]$ExpectedResolved,
  [bool]$ExpectedConnectedStage
) {
  Write-Host "[scenario:$Outcome] creating visitor and posting followup lifecycle..."

  $visitorId = Create-TestVisitor $Outcome
  $base = (Get-Date).ToUniversalTime().AddMinutes(-5)

  Post-FormationEvent -VisitorId $visitorId -Type "FOLLOWUP_ASSIGNED" -OccurredAt $base -Data @{
    assigneeId = "ops-user-1"
  }

  Start-Sleep -Milliseconds 50

  Post-FormationEvent -VisitorId $visitorId -Type "FOLLOWUP_CONTACTED" -OccurredAt $base.AddSeconds(1) -Data @{
    method = "phone"
  }

  Start-Sleep -Milliseconds 50

  Post-FormationEvent -VisitorId $visitorId -Type "FOLLOWUP_OUTCOME_RECORDED" -OccurredAt $base.AddSeconds(2) -Data @{
    outcome = $Outcome
  }

  Start-Sleep -Milliseconds 500

  $profile = Get-FormationProfile $visitorId
  $integration = Get-IntegrationSummary $visitorId
  $dashboard = Json-Get "$ApiBase/dashboard/followups?limit=500"
  $opsDefault = Json-Get "$OpsBase/ops/followups?visitorId=$([Uri]::EscapeDataString($visitorId))&includeResolved=false&limit=20"
  $opsIncluded = Json-Get "$OpsBase/ops/followups?visitorId=$([Uri]::EscapeDataString($visitorId))&includeResolved=true&limit=20"

  $dashboardItem = Get-ItemByVisitorId -Items $dashboard.items -VisitorId $visitorId
  $opsDefaultItem = Get-ItemByVisitorId -Items $opsDefault.items -VisitorId $visitorId
  $opsIncludedItem = Get-ItemByVisitorId -Items $opsIncluded.items -VisitorId $visitorId

  Write-Host "[debug:$Outcome] profile stage=$($profile.stage) outcome=$($profile.lastFollowupOutcome)"
  Write-Host "[debug:$Outcome] integration followupResolved=$($integration.followupResolved) needsFollowup=$($integration.needsFollowup)"
  Write-Host "[debug:$Outcome] dashboardPresent=$($null -ne $dashboardItem) opsDefaultPresent=$($null -ne $opsDefaultItem) opsIncludedPresent=$($null -ne $opsIncludedItem)"

  Assert ($null -ne $profile) "$Outcome profile should exist"
  Assert ([string]$profile.lastFollowupOutcome -eq $Outcome) "$Outcome profile lastFollowupOutcome should match"
  Assert (-not [string]::IsNullOrWhiteSpace([string]$profile.lastFollowupOutcomeAt)) "$Outcome profile should have lastFollowupOutcomeAt"

  if ($ExpectedConnectedStage) {
    Assert ([string]$profile.stage -eq "Connected") "$Outcome should advance profile stage to Connected"
  } else {
    Assert ([string]$profile.stage -ne "Connected") "$Outcome should not advance profile stage to Connected"
  }

  Assert ($null -ne $integration) "$Outcome integration summary should exist"
  Assert ([bool]$integration.followupResolved -eq $ExpectedResolved) "$Outcome integration followupResolved mismatch"

  if ($ExpectedResolved) {
    Assert ($integration.needsFollowup -eq $false) "$Outcome integration needsFollowup should be false"
    Assert ($null -eq $dashboardItem) "$Outcome resolved visitor should not appear in dashboard followups"
    Assert ($null -eq $opsDefaultItem) "$Outcome resolved visitor should not appear in default ops followups"
    Assert ($null -ne $opsIncludedItem) "$Outcome resolved visitor should appear when includeResolved=true"
    Assert ($opsIncludedItem.followupResolved -eq $true) "$Outcome included ops item should be resolved"
  } else {
    Assert ($integration.needsFollowup -eq $true) "$Outcome integration needsFollowup should be true"
    Assert ($null -ne $dashboardItem) "$Outcome active visitor should appear in dashboard followups"
    Assert ($null -ne $opsDefaultItem) "$Outcome active visitor should appear in default ops followups"
    Assert ($opsDefaultItem.followupResolved -ne $true) "$Outcome default ops item should be unresolved"
  }
}

Write-Host "Running followup cross-surface outcome consistency matrix..."
Write-Host "ApiBase=$ApiBase"
Write-Host "OpsBase=$OpsBase"

Assert-OutcomeScenario -Outcome "connected" -ExpectedResolved $true -ExpectedConnectedStage $true
Assert-OutcomeScenario -Outcome "closed" -ExpectedResolved $true -ExpectedConnectedStage $false
Assert-OutcomeScenario -Outcome "no_response" -ExpectedResolved $false -ExpectedConnectedStage $false
Assert-OutcomeScenario -Outcome "left_message" -ExpectedResolved $false -ExpectedConnectedStage $false
Assert-OutcomeScenario -Outcome "needs_care" -ExpectedResolved $false -ExpectedConnectedStage $false

Write-Host "OK: followup cross-surface outcome consistency matrix passed." -ForegroundColor Green
