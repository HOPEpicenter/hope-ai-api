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
    source = @{ system = "assert-latest-activity-consistency" }
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
    source = @{ system = "assert-latest-activity-consistency" }
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

Post-EngagementTransition -VisitorId $visitorId -OccurredAt $base
Start-Sleep -Milliseconds 100
Post-FormationEvent -VisitorId $visitorId -OccurredAt $base.AddSeconds(30)

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

Assert ($null -ne $profile.profile) "formation profile missing"
Assert ([string]$profile.profile.lastEventAt -eq [string]$latest.occurredAt) "formation profile lastEventAt does not match integration latest"
Assert ([string]$profile.profile.lastEventType -eq [string]$latest.type) "formation profile lastEventType does not match integration latest type"

Assert ($null -ne $insights.insights) "activity insights missing"
Assert ($null -ne $insights.insights.lastMeaningfulActivity) "activity insights lastMeaningfulActivity missing"
Assert ([string]$insights.insights.lastMeaningfulActivity.occurredAt -eq [string]$latest.occurredAt) "activity insights lastMeaningfulActivity occurredAt does not match integration latest"
Assert ([string]$insights.insights.lastMeaningfulActivity.summary -eq [string]$latest.summary) "activity insights lastMeaningfulActivity summary does not match integration latest summary"

Write-Host "Latest activity consistency invariant passed."
