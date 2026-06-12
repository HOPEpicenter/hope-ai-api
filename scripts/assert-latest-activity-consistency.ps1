param(
  [string]$BaseUrl = "http://localhost:7071",
  [string]$ApiKey = $env:HOPE_API_KEY
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

Write-Host "Running latest activity consistency invariant..."

function Assert([bool]$Condition, [string]$Message) {
  if (-not $Condition) {
    throw $Message
  }
}

function Get-Headers {
  if ([string]::IsNullOrWhiteSpace($ApiKey)) {
    throw "HOPE_API_KEY required"
  }

  return @{ "x-api-key" = $ApiKey }
}

function New-TestVisitor {
  $suffix = [guid]::NewGuid().ToString("N")
  $body = @{
    name = "Latest Activity Consistency $($suffix.Substring(0, 8))"
    email = "latest-activity+$suffix@test.com"
  } | ConvertTo-Json

  $response = Invoke-RestMethod `
    -Method POST `
    -Uri "$BaseUrl/api/visitors" `
    -ContentType "application/json" `
    -Body $body

  Assert (-not [string]::IsNullOrWhiteSpace([string]$response.visitorId)) "visitorId missing from create visitor response"
  return [string]$response.visitorId
}

function Post-EngagementTransition([string]$VisitorId, [datetime]$OccurredAt) {
  $body = @{
    v = 1
    eventId = "evt-$([guid]::NewGuid().ToString("N"))"
    visitorId = $VisitorId
    type = "status.transition"
    occurredAt = $OccurredAt.ToUniversalTime().ToString("o")
    source = @{ system = "assert-latest-activity-consistency"; actorId = "ops-user-1" }
    data = @{
      from = "NEW"
      to = "ENGAGED"
    }
  } | ConvertTo-Json -Depth 10

  Invoke-RestMethod `
    -Method POST `
    -Uri "$BaseUrl/api/engagements/events" `
    -Headers (Get-Headers) `
    -ContentType "application/json" `
    -Body $body | Out-Null
}

function Post-FormationEvent([string]$VisitorId, [datetime]$OccurredAt) {
  $body = @{
    v = 1
    eventId = "evt-$([guid]::NewGuid().ToString("N"))"
    visitorId = $VisitorId
    type = "FOLLOWUP_CONTACTED"
    occurredAt = $OccurredAt.ToUniversalTime().ToString("o")
    source = @{ system = "assert-latest-activity-consistency"; actorId = "ops-user-1" }
    data = @{
      summary = "Latest activity consistency formation contact"
    }
  } | ConvertTo-Json -Depth 10

  Invoke-RestMethod `
    -Method POST `
    -Uri "$BaseUrl/api/formation/events" `
    -Headers (Get-Headers) `
    -ContentType "application/json" `
    -Body $body | Out-Null
}


function Post-NextStepCompleted([string]$VisitorId, [datetime]$OccurredAt) {
  $body = @{
    v = 1
    eventId = "evt-$([guid]::NewGuid().ToString("N"))"
    visitorId = $VisitorId
    type = "NEXT_STEP_COMPLETED"
    occurredAt = $OccurredAt.ToUniversalTime().ToString("o")
    source = @{ system = "assert-latest-activity-consistency"; actorId = "ops-user-1" }
    data = @{
      nextStep = "prayer"
    }
  } | ConvertTo-Json -Depth 10

  Invoke-RestMethod `
    -Method POST `
    -Uri "$BaseUrl/api/formation/events" `
    -Headers (Get-Headers) `
    -ContentType "application/json" `
    -Body $body | Out-Null
}
function Get-IntegrationTimeline([string]$VisitorId) {
  Invoke-RestMethod `
    -Method GET `
    -Uri "$BaseUrl/api/integration/timeline?visitorId=$([Uri]::EscapeDataString($VisitorId))&limit=20" `
    -Headers (Get-Headers)
}

function Get-VisitorSummary([string]$VisitorId) {
  Invoke-RestMethod `
    -Method GET `
    -Uri "$BaseUrl/api/visitors/$([Uri]::EscapeDataString($VisitorId))/summary" `
    -Headers (Get-Headers)
}

function Get-DashboardCard([string]$VisitorId) {
  Invoke-RestMethod `
    -Method GET `
    -Uri "$BaseUrl/api/visitors/$([Uri]::EscapeDataString($VisitorId))/dashboard-card" `
    -Headers (Get-Headers)
}

function Get-FormationProfile([string]$VisitorId) {
  Invoke-RestMethod `
    -Method GET `
    -Uri "$BaseUrl/api/visitors/$([Uri]::EscapeDataString($VisitorId))/formation/profile" `
    -Headers (Get-Headers)
}

function Get-ActivityInsights([string]$VisitorId) {
  Invoke-RestMethod `
    -Method GET `
    -Uri "$BaseUrl/api/visitors/$([Uri]::EscapeDataString($VisitorId))/activity-insights" `
    -Headers (Get-Headers)
}

$visitorId = New-TestVisitor
$base = (Get-Date).ToUniversalTime().AddMinutes(-10)

$prayerRequestedAt = $base.AddSeconds(-30)
$body = @{
  v = 1
  eventId = "evt-$([guid]::NewGuid().ToString("N"))"
  visitorId = $visitorId
  type = "PRAYER_REQUESTED"
  occurredAt = $prayerRequestedAt.ToUniversalTime().ToString("o")
  source = @{ system = "assert-latest-activity-consistency"; actorId = "ops-user-1" }
  data = @{
    topic = "guidance"
    shareWith = "pastoral_only"
  }
} | ConvertTo-Json -Depth 10

Invoke-RestMethod `
  -Method POST `
  -Uri "$BaseUrl/api/formation/events" `
  -Headers (Get-Headers) `
  -ContentType "application/json" `
  -Body $body | Out-Null

Start-Sleep -Milliseconds 100

Post-EngagementTransition -VisitorId $visitorId -OccurredAt $base
Start-Sleep -Milliseconds 100
Post-FormationEvent -VisitorId $visitorId -OccurredAt $base.AddSeconds(30)
Start-Sleep -Milliseconds 100
Post-NextStepCompleted -VisitorId $visitorId -OccurredAt $base.AddSeconds(60)
Start-Sleep -Milliseconds 100

$followupOutcomeAt = $base.AddSeconds(90)
$body = @{
  v = 1
  eventId = "evt-$([guid]::NewGuid().ToString("N"))"
  visitorId = $visitorId
  type = "FOLLOWUP_OUTCOME_RECORDED"
  occurredAt = $followupOutcomeAt.ToUniversalTime().ToString("o")
  source = @{ system = "assert-latest-activity-consistency"; actorId = "ops-user-1" }
  data = @{
    outcome = "needs_care"
  }
} | ConvertTo-Json -Depth 10

Invoke-RestMethod `
  -Method POST `
  -Uri "$BaseUrl/api/formation/events" `
  -Headers (Get-Headers) `
  -ContentType "application/json" `
  -Body $body | Out-Null

$timeline = Get-IntegrationTimeline -VisitorId $visitorId
$summary = Get-VisitorSummary -VisitorId $visitorId
$card = Get-DashboardCard -VisitorId $visitorId
$profile = Get-FormationProfile -VisitorId $visitorId
$insights = Get-ActivityInsights -VisitorId $visitorId

$timelineItems = @($timeline.items)
Assert ($timelineItems.Count -gt 0) "integration timeline returned no items"

$latest = $timelineItems[0]
$summaryPreview = @($summary.summary.engagement.timelinePreview)
$summaryLatest = if ($summaryPreview.Count -gt 0) { $summaryPreview[0] } else { $null }

Assert ($null -ne $summaryLatest) "summary timelinePreview returned no latest item"
Assert ($null -ne $card.card) "dashboard card missing"

Write-Host "[debug] latest integration item:"
$latest | ConvertTo-Json -Depth 8 | Write-Host

Write-Host "[debug] summary latest item:"
$summaryLatest | ConvertTo-Json -Depth 8 | Write-Host

Write-Host "[debug] dashboard card:"
$card.card | ConvertTo-Json -Depth 8 | Write-Host

Write-Host "[debug] formation profile:"
$profile.profile | ConvertTo-Json -Depth 8 | Write-Host

Write-Host "[debug] activity insights:"
$insights.insights | ConvertTo-Json -Depth 8 | Write-Host

Assert ([string]$summaryLatest.occurredAt -eq [string]$latest.occurredAt) "summary latest occurredAt does not match integration latest"
Assert ([string]$summaryLatest.eventId -eq [string]$latest.eventId) "summary latest eventId does not match integration latest"

Assert ([string]$card.card.lastActivityAt -eq [string]$latest.occurredAt) "dashboard card lastActivityAt does not match integration latest"
Assert ([string]$card.card.lastActivitySummary -eq [string]$latest.summary) "dashboard card lastActivitySummary does not match integration latest summary"
Assert ([string]$card.card.lastNextStepAt -eq [string]$profile.profile.lastNextStepAt) "dashboard card lastNextStepAt does not match formation profile"
Assert ([string]$card.card.lastNextStepCompletedAt -eq [string]$profile.profile.lastNextStepCompletedAt) "dashboard card lastNextStepCompletedAt does not match formation profile"
Assert ([string]$card.card.lastFollowupOutcome -eq [string]$profile.profile.lastFollowupOutcome) "dashboard card lastFollowupOutcome does not match formation profile"
Assert ([string]$card.card.lastFollowupOutcomeAt -eq [string]$profile.profile.lastFollowupOutcomeAt) "dashboard card lastFollowupOutcomeAt does not match formation profile"

Assert ($null -ne $profile.profile) "formation profile missing"
Assert ([string]$profile.profile.lastEventAt -eq [string]$latest.occurredAt) "formation profile lastEventAt does not match integration latest"
Assert ([string]$profile.profile.lastEventType -eq [string]$latest.type) "formation profile lastEventType does not match integration latest type"
Assert ([string]$profile.profile.lastEventType -eq "FOLLOWUP_OUTCOME_RECORDED") "formation profile latest event should be FOLLOWUP_OUTCOME_RECORDED"
Assert ([string]$profile.profile.lastNextStepCompletedAt -eq [string]$card.card.lastNextStepCompletedAt) "formation profile lastNextStepCompletedAt does not match dashboard card"
Assert (-not [string]::IsNullOrWhiteSpace([string]$profile.profile.lastPrayerRequestedAt)) "formation profile lastPrayerRequestedAt should be present"
Assert ([string]$card.card.lastPrayerRequestedAt -eq [string]$profile.profile.lastPrayerRequestedAt) "dashboard card lastPrayerRequestedAt does not match formation profile"
Assert ([string]$card.card.stage -eq [string]$profile.profile.stage) "dashboard card stage does not match formation profile"
Assert ([string]$card.card.stageReason -eq [string]$profile.profile.stageReason) "dashboard card stageReason does not match formation profile"
Assert ([string]$card.card.stageUpdatedAt -eq [string]$profile.profile.stageUpdatedAt) "dashboard card stageUpdatedAt does not match formation profile"
Assert ([string]$card.card.stageUpdatedBy -eq [string]$profile.profile.stageUpdatedBy) "dashboard card stageUpdatedBy does not match formation profile"

$risk = $summary.summary.engagement.risk
Assert ($null -ne $risk) "summary engagement risk missing"
Assert ([string]$card.card.riskLevel -eq [string]$risk.riskLevel) "dashboard card riskLevel does not match summary risk"
Assert ([int]$card.card.riskScore -eq [int]$risk.riskScore) "dashboard card riskScore does not match summary risk"
Assert ([string]$card.card.recommendedAction -eq [string]$risk.recommendedAction) "dashboard card recommendedAction does not match summary risk"
Assert ([bool]$card.card.needsFollowup -eq [bool]$risk.engagement.needsFollowup) "dashboard card needsFollowup does not match summary risk"

Assert ([string]$card.card.priorityBand -eq "low") "dashboard card priorityBand should be low for resolved low-risk scenario"
Assert ([int]$card.card.priorityScore -eq 10) "dashboard card priorityScore should be 10 for resolved low-risk scenario"
Assert ([string]$card.card.priorityReason -eq "low_risk") "dashboard card priorityReason should be low_risk for resolved low-risk scenario"

Assert ($null -eq $card.card.followupUrgency) "dashboard card followupUrgency should be null for unassigned resolved scenario"
Assert ([bool]$card.card.followupOverdue -eq $false) "dashboard card followupOverdue should be false for unassigned resolved scenario"

Assert ($null -ne $insights.insights) "activity insights missing"
Assert ($null -ne $insights.insights.lastMeaningfulActivity) "activity insights lastMeaningfulActivity missing"
Assert ([string]$insights.insights.lastMeaningfulActivity.occurredAt -eq [string]$latest.occurredAt) "activity insights lastMeaningfulActivity occurredAt does not match integration latest"
Assert ([string]$insights.insights.lastMeaningfulActivity.summary -eq [string]$latest.summary) "activity insights lastMeaningfulActivity summary does not match integration latest summary"

Write-Host "Latest activity consistency invariant passed."
