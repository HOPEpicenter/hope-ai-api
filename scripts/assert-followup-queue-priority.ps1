param(
  [string]$BaseUrl = "http://127.0.0.1:3000",
  [string]$ApiKey = ""
)

$ErrorActionPreference = "Stop"

if ([string]::IsNullOrWhiteSpace($ApiKey)) {
  $ApiKey = $env:HOPE_API_KEY
}

if ([string]::IsNullOrWhiteSpace($ApiKey)) {
  throw "HOPE_API_KEY is required"
}

$headers = @{ "x-api-key" = $ApiKey }

function Assert-True($cond, $msg) {
  if (-not $cond) { throw "ASSERT FAIL: $msg" }
}

function New-Visitor($email) {
  Invoke-RestMethod `
    -Method POST `
    -Headers $headers `
    -Uri "$BaseUrl/api/visitors" `
    -Body (@{
      name = "Queue Priority Assert"
      email = $email
      v = 1
    } | ConvertTo-Json) `
    -ContentType "application/json"
}

function Post-FormationEvent($visitorId, $type, $data) {
  Invoke-RestMethod `
    -Method POST `
    -Headers $headers `
    -Uri "$BaseUrl/api/formation/events" `
    -Body (@{
      v = 1
      eventId = "evt-" + [guid]::NewGuid().ToString("N")
      visitorId = $visitorId
      type = $type
      occurredAt = (Get-Date).ToString("o")
      source = @{ system = "assert-followup-queue-priority.ps1" }
      data = $data
    } | ConvertTo-Json -Depth 6) `
    -ContentType "application/json" | Out-Null
}

function Post-EngagementEvent($visitorId, $type, $data, $minutesAgo = 0) {
  Invoke-RestMethod `
    -Method POST `
    -Headers $headers `
    -Uri "$BaseUrl/api/engagements/events" `
    -Body (@{
      v = 1
      eventId = "evt-" + [guid]::NewGuid().ToString("N")
      visitorId = $visitorId
      type = $type
      occurredAt = (Get-Date).AddMinutes(-1 * $minutesAgo).ToString("o")
      source = @{ system = "assert-followup-queue-priority.ps1" }
      data = $data
    } | ConvertTo-Json -Depth 6) `
    -ContentType "application/json" | Out-Null
}

Write-Host "=== ASSERT: followup queue priority enrichment ==="

# High-risk queue item: assigned followup, no engagement signals
$high = New-Visitor ("queue-high+" + [guid]::NewGuid().ToString("N") + "@example.com")
$highId = [string]$high.visitorId
Post-FormationEvent $highId "FOLLOWUP_ASSIGNED" @{ assigneeId = "user-1" }

# Lower-risk queue item: assigned followup, plus recent engagement signals
$low = New-Visitor ("queue-low+" + [guid]::NewGuid().ToString("N") + "@example.com")
$lowId = [string]$low.visitorId
Post-FormationEvent $lowId "FOLLOWUP_ASSIGNED" @{ assigneeId = "user-1" }
Post-EngagementEvent $lowId "note.add" @{ text = "recent note" } 5
Post-EngagementEvent $lowId "status.transition" @{ from = "open"; to = "in_progress" } 4
Post-EngagementEvent $lowId "tag.add" @{ tag = "follow_up" } 3

Start-Sleep -Seconds 2

$q = Invoke-RestMethod `
  -Method GET `
  -Headers $headers `
  -Uri "$BaseUrl/ops/followups?limit=20"

Assert-True ($q.ok -eq $true) "queue should return ok=true"

$highItem = $q.items | Where-Object { $_.visitorId -eq $highId } | Select-Object -First 1
$lowItem  = $q.items | Where-Object { $_.visitorId -eq $lowId }  | Select-Object -First 1

Assert-True ($null -ne $highItem) "high-risk queue item should exist"
Assert-True ($null -ne $lowItem) "low-risk queue item should exist"

Assert-True ($highItem.engagementRiskScore -ge $lowItem.engagementRiskScore) "high-risk item should have >= engagementRiskScore"
Assert-True ($highItem.priorityBand -in @("urgent","high","normal","low")) "high item should expose priorityBand"
Assert-True ($lowItem.priorityBand -in @("urgent","high","normal","low")) "low item should expose priorityBand"

Write-Host "OK: followup queue priority assert passed."
