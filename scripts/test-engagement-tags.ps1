param(
  [string]$ApiBase = "http://127.0.0.1:3000",
  [string]$ApiKey = $env:HOPE_API_KEY,
  [string]$VisitorId
)

if (-not $VisitorId) {
  throw "VisitorId is required."
}

$headers = @{
  "x-api-key" = $ApiKey
  "content-type" = "application/json"
  "accept" = "application/json"
}

function Post-Event($type, $data, $occurredAt) {
  $body = @{
    v = 1
    eventId = [guid]::NewGuid().ToString()
    visitorId = $VisitorId
    type = $type
    occurredAt = $occurredAt
    source = @{ system = "dashboard" }
    data = $data
  } | ConvertTo-Json -Depth 6

  Invoke-RestMethod -Uri "$ApiBase/api/engagements/events" -Method Post -Headers $headers -Body $body | Out-Null
}

Post-Event 'TAG_ADDED' @{ tag = 'prayer'; actorId = 'dmyrie' } ((Get-Date).ToUniversalTime().AddMinutes(-3).ToString('o'))
Post-Event 'TAG_ADDED' @{ tag = 'first-time'; actorId = 'dmyrie' } ((Get-Date).ToUniversalTime().AddMinutes(-2).ToString('o'))
Post-Event 'TAG_REMOVED' @{ tag = 'first-time'; actorId = 'dmyrie' } ((Get-Date).ToUniversalTime().AddMinutes(-1).ToString('o'))

$card = Invoke-RestMethod -Uri "$ApiBase/ops/visitors/$VisitorId/dashboard-card" -Headers @{ "x-api-key" = $ApiKey; "accept" = "application/json" } -Method Get

$tags = @($card.card.tags)
if ($tags -notcontains 'prayer') {
  throw "Expected 'prayer' tag to be present."
}
if ($tags -contains 'first-time') {
  throw "Expected 'first-time' tag to be removed."
}

$card | ConvertTo-Json -Depth 8