param(
  [string]$ApiBaseUrl = "http://127.0.0.1:3000/api",
  [string]$ApiKey = $env:HOPE_API_KEY
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

if ([string]::IsNullOrWhiteSpace($ApiKey)) {
  throw "HOPE_API_KEY required"
}

$Headers = @{ "x-api-key" = $ApiKey }

function Assert([bool]$Condition, [string]$Message) {
  if (-not $Condition) {
    throw $Message
  }
}

function Read-Timeline([string]$VisitorId, [int]$Limit = 10, [string]$Cursor = "") {
  $uri = "$ApiBaseUrl/engagements/$([Uri]::EscapeDataString($VisitorId))/timeline?limit=$Limit"
  if (-not [string]::IsNullOrWhiteSpace($Cursor)) {
    $uri = "$uri&cursor=$([Uri]::EscapeDataString($Cursor))"
  }

  Invoke-RestMethod -Method GET -Uri $uri -Headers $Headers
}

$stamp = Get-Date -Format "yyyyMMddHHmmss"
$email = "assert-visitor-engagement-timeline+$([Guid]::NewGuid().ToString('N'))@example.com"

Write-Host "[timeline] creating visitor" -ForegroundColor Cyan
$visitor = Invoke-RestMethod `
  -Method POST `
  -Uri "$ApiBaseUrl/visitors" `
  -ContentType "application/json" `
  -Body (@{
    name  = "Assert Visitor Timeline $stamp"
    email = $email
  } | ConvertTo-Json -Depth 10)

$visitorId = [string]$visitor.visitorId
Assert (-not [string]::IsNullOrWhiteSpace($visitorId)) "visitorId missing from create visitor response"

$base = (Get-Date).ToUniversalTime().AddMinutes(-5)

$engagementEvent = @{
  v = 1
  eventId = "evt-$([Guid]::NewGuid().ToString('N'))"
  visitorId = $visitorId
  type = "note.add"
  occurredAt = $base.ToString("o")
  source = @{ system = "assert-visitor-engagement-timeline" }
  data = @{ text = "engagement event" }
} | ConvertTo-Json -Depth 20

Write-Host "[timeline] posting engagement event" -ForegroundColor Cyan
Invoke-RestMethod `
  -Method POST `
  -Uri "$ApiBaseUrl/engagements/events" `
  -Headers $Headers `
  -ContentType "application/json" `
  -Body $engagementEvent | Out-Null

$formationEvent = @{
  v = 1
  eventId = "evt-$([Guid]::NewGuid().ToString('N'))"
  visitorId = $visitorId
  type = "FOLLOWUP_ASSIGNED"
  occurredAt = $base.AddMinutes(1).ToString("o")
  source = @{ system = "assert-visitor-engagement-timeline" }
  data = @{ assigneeId = "ops-user-1" }
} | ConvertTo-Json -Depth 20

Write-Host "[timeline] posting formation event" -ForegroundColor Cyan
Invoke-RestMethod `
  -Method POST `
  -Uri "$ApiBaseUrl/formation/events" `
  -Headers $Headers `
  -ContentType "application/json" `
  -Body $formationEvent | Out-Null

Write-Host "[timeline] reading timeline" -ForegroundColor Cyan
$timeline = Read-Timeline -VisitorId $visitorId -Limit 10

Assert ($timeline.ok -eq $true) "expected ok=true"
Assert ([string]$timeline.visitorId -eq $visitorId) "visitorId mismatch"

$items = @($timeline.items)
Assert ($items.Count -ge 2) "expected at least 2 timeline items"

$streams = @($items | ForEach-Object { [string]$_.stream })
Assert ($streams -contains "engagement") "expected engagement stream item"
Assert ($streams -contains "formation") "expected formation stream item"

$times = @($items | ForEach-Object { [DateTimeOffset]::Parse([string]$_.occurredAt).ToUnixTimeMilliseconds() })
for ($i = 1; $i -lt $times.Count; $i++) {
  Assert ($times[$i - 1] -ge $times[$i]) "timeline not sorted newest-first"
}

if ($null -ne $timeline.nextCursor) {
  Assert ($timeline.nextCursor -is [string]) "nextCursor should be null or string"
}

Write-Host "[assert-visitor-engagement-timeline] OK" -ForegroundColor Green

