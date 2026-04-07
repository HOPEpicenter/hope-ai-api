param(
  [string]$ApiBase = "http://localhost:7071/api",
  [string]$OpsBase = "http://localhost:7071/ops",
  [string]$ApiKey = $env:HOPE_API_KEY
)

Write-Host "[ops-followups-queue] test start"

if (-not $ApiKey) {
  throw "HOPE_API_KEY is required"
}

$stamp = [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()

$visitor = Invoke-RestMethod -Method POST -Uri "$ApiBase/visitors" -Body (@{
  name = "Ops Followup Queue $stamp"
  email = "ops-followups-$stamp@test.com"
} | ConvertTo-Json) -ContentType "application/json"

$visitorId = $visitor.visitorId
if (-not $visitorId) { throw "visitorId missing" }

$assignedAt = (Get-Date).ToUniversalTime().AddHours(-30).ToString("o")

$event = @{
  visitorId = $visitorId
  type = "FOLLOWUP_ASSIGNED"
  occurredAt = $assignedAt
  source = @{ system = "assert-ops-followups-queue" }
  data = @{ assigneeId = "ops-user-queue" }
} | ConvertTo-Json -Depth 10

Invoke-RestMethod -Method POST -Uri "$ApiBase/formation/events" -Headers @{
  "x-api-key" = $ApiKey
} -Body $event -ContentType "application/json" | Out-Null

$queue = Invoke-RestMethod -Method GET -Uri "$OpsBase/followups?limit=10" -Headers @{
  "x-api-key" = $ApiKey
}

if (-not $queue.ok) { throw "queue ok false" }
if (-not $queue.items) { throw "queue items missing" }

$item = $queue.items | Where-Object { $_.visitorId -eq $visitorId } | Select-Object -First 1
if (-not $item) { throw "queue item missing for visitor" }
if ($item.followupUrgency -ne "AT_RISK") { throw "expected AT_RISK urgency" }
if ($item.followupPriorityScore -ne 60) { throw "expected priority score 60" }
if ($item.followupAgingBucket -ne "ONE_DAY") { throw "expected ONE_DAY aging bucket" }
if ($item.followupEscalated -ne $false) { throw "expected followupEscalated false" }

Write-Host "[ops-followups-queue] OK" -ForegroundColor Green