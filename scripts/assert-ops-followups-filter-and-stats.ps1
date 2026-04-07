param(
  [string]$ApiBase = "http://localhost:7071/api",
  [string]$OpsBase = "http://localhost:7071/ops",
  [string]$ApiKey = $env:HOPE_API_KEY
)

Write-Host "[ops-followups-filter-and-stats] test start"

if (-not $ApiKey) {
  throw "HOPE_API_KEY is required"
}

$stamp = [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()

$visitorA = Invoke-RestMethod -Method POST -Uri "$ApiBase/visitors" -Body (@{
  name = "Ops Filter A $stamp"
  email = "ops-filter-a-$stamp@test.com"
} | ConvertTo-Json) -ContentType "application/json"

$visitorB = Invoke-RestMethod -Method POST -Uri "$ApiBase/visitors" -Body (@{
  name = "Ops Filter B $stamp"
  email = "ops-filter-b-$stamp@test.com"
} | ConvertTo-Json) -ContentType "application/json"

$assignedAtA = (Get-Date).ToUniversalTime().AddHours(-30).ToString("o")
$assignedAtB = (Get-Date).ToUniversalTime().AddHours(-6).ToString("o")

$eventA = @{
  visitorId = $visitorA.visitorId
  type = "FOLLOWUP_ASSIGNED"
  occurredAt = $assignedAtA
  source = @{ system = "assert-ops-followups-filter-and-stats" }
  data = @{ assigneeId = "ops-user-alpha" }
} | ConvertTo-Json -Depth 10

$eventB = @{
  visitorId = $visitorB.visitorId
  type = "FOLLOWUP_ASSIGNED"
  occurredAt = $assignedAtB
  source = @{ system = "assert-ops-followups-filter-and-stats" }
  data = @{ assigneeId = "ops-user-beta" }
} | ConvertTo-Json -Depth 10

Invoke-RestMethod -Method POST -Uri "$ApiBase/formation/events" -Headers @{
  "x-api-key" = $ApiKey
} -Body $eventA -ContentType "application/json" | Out-Null

Invoke-RestMethod -Method POST -Uri "$ApiBase/formation/events" -Headers @{
  "x-api-key" = $ApiKey
} -Body $eventB -ContentType "application/json" | Out-Null

$queue = Invoke-RestMethod -Method GET -Uri "$OpsBase/followups?assignedTo=ops-user-alpha&limit=10" -Headers @{
  "x-api-key" = $ApiKey
}

if (-not $queue.ok) { throw "queue ok false" }
if ($queue.assignedTo -ne "ops-user-alpha") { throw "assignedTo echo mismatch" }
if (-not $queue.stats) { throw "stats missing" }
if ($queue.stats.total -lt 1) { throw "expected at least one filtered item" }
if ($queue.stats.atRisk -lt 1) { throw "expected at least one AT_RISK item" }

$item = $queue.items | Where-Object { $_.visitorId -eq $visitorA.visitorId } | Select-Object -First 1
if (-not $item) { throw "filtered item missing" }
if ($item.assignedTo.ownerId -ne "ops-user-alpha") { throw "assignedTo filter failed" }
if ($item.followupUrgency -ne "AT_RISK") { throw "expected AT_RISK urgency" }

$wrongItem = $queue.items | Where-Object { $_.visitorId -eq $visitorB.visitorId } | Select-Object -First 1
if ($wrongItem) { throw "unexpected visitor from different assignee present" }

Write-Host "[ops-followups-filter-and-stats] OK" -ForegroundColor Green