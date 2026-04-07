param(
  [string]$ApiBase = "http://localhost:7071/api",
  [string]$OpsBase = "http://localhost:7071/ops",
  [string]$ApiKey = $env:HOPE_API_KEY
)

Write-Host "[ops-followups-include-resolved] test start"

if (-not $ApiKey) {
  throw "HOPE_API_KEY is required"
}

$stamp = [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()

$visitor = Invoke-RestMethod -Method POST -Uri "$ApiBase/visitors" -Body (@{
  name = "Ops Resolved $stamp"
  email = "ops-resolved-$stamp@test.com"
} | ConvertTo-Json) -ContentType "application/json"

$visitorId = $visitor.visitorId
if (-not $visitorId) { throw "visitorId missing" }

$assignedAt = (Get-Date).ToUniversalTime().AddHours(-30).ToString("o")
$contactedAt = (Get-Date).ToUniversalTime().AddHours(-29).ToString("o")
$outcomeAt = (Get-Date).ToUniversalTime().AddHours(-28).ToString("o")

$events = @(
  @{
    visitorId = $visitorId
    type = "FOLLOWUP_ASSIGNED"
    occurredAt = $assignedAt
    source = @{ system = "assert-ops-followups-include-resolved" }
    data = @{ assigneeId = "ops-user-resolved" }
  },
  @{
    visitorId = $visitorId
    type = "FOLLOWUP_CONTACTED"
    occurredAt = $contactedAt
    source = @{ system = "assert-ops-followups-include-resolved" }
    data = @{ method = "phone" }
  },
  @{
    visitorId = $visitorId
    type = "FOLLOWUP_OUTCOME_RECORDED"
    occurredAt = $outcomeAt
    source = @{ system = "assert-ops-followups-include-resolved" }
    data = @{ outcome = "connected" }
  }
)

foreach ($evt in $events) {
  Invoke-RestMethod -Method POST -Uri "$ApiBase/formation/events" -Headers @{
    "x-api-key" = $ApiKey
  } -Body ($evt | ConvertTo-Json -Depth 10) -ContentType "application/json" | Out-Null
}

$defaultQueue = Invoke-RestMethod -Method GET -Uri "$OpsBase/followups?assignedTo=ops-user-resolved&limit=10" -Headers @{
  "x-api-key" = $ApiKey
}

$resolvedQueue = Invoke-RestMethod -Method GET -Uri "$OpsBase/followups?assignedTo=ops-user-resolved&includeResolved=true&limit=10" -Headers @{
  "x-api-key" = $ApiKey
}

if (-not $defaultQueue.ok) { throw "default queue ok false" }
if (-not $resolvedQueue.ok) { throw "resolved queue ok false" }

$defaultItem = $defaultQueue.items | Where-Object { $_.visitorId -eq $visitorId } | Select-Object -First 1
if ($defaultItem) { throw "resolved item should not appear by default" }

$resolvedItem = $resolvedQueue.items | Where-Object { $_.visitorId -eq $visitorId } | Select-Object -First 1
if (-not $resolvedItem) { throw "resolved item missing when includeResolved=true" }
if ($resolvedItem.followupResolved -ne $true) { throw "expected followupResolved true" }
if ($resolvedQueue.stats.resolved -lt 1) { throw "expected resolved stats count" }
if ($resolvedItem.followupReason -ne "FOLLOWUP_OUTCOME_RECORDED") { throw "expected resolved followup reason" }

Write-Host "[ops-followups-include-resolved] OK" -ForegroundColor Green