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

function Post-Event($type, $summary, $occurredAt, $data) {
  $body = @{
    v = 1
    eventId = [guid]::NewGuid().ToString()
    visitorId = $VisitorId
    type = $type
    occurredAt = $occurredAt
    source = @{
      system = "dashboard"
    }
    data = $data
  } | ConvertTo-Json -Depth 6

  Invoke-RestMethod -Uri "$ApiBase/api/engagements/events" -Method Post -Headers $headers -Body $body | Out-Null
}

Post-Event 'CONTACT_CALL' 'Called and left voicemail' ((Get-Date).ToUniversalTime().AddMinutes(-2).ToString('o')) @{
  summary = 'Called and left voicemail'
  direction = 'outbound'
  outcome = 'voicemail'
  actorId = 'dmyrie'
}

Post-Event 'CONTACT_TEXT' 'Sent welcome text' ((Get-Date).ToUniversalTime().AddMinutes(-1).ToString('o')) @{
  summary = 'Sent welcome text'
  direction = 'outbound'
  outcome = 'sent'
  actorId = 'dmyrie'
}

Post-Event 'CONTACT_MEETING' 'Met after service' ((Get-Date).ToUniversalTime().ToString('o')) @{
  summary = 'Met after service'
  outcome = 'completed'
  actorId = 'dmyrie'
}

$timeline = Invoke-RestMethod -Uri "$ApiBase/api/engagements/$VisitorId/timeline" -Headers $headers -Method Get

$required = @(
  'Called and left voicemail',
  'Sent welcome text',
  'Met after service'
)

foreach ($expected in $required) {
  if (-not ($timeline.items | Where-Object { $_.summary -eq $expected })) {
    throw "Missing expected timeline summary: $expected"
  }
}

$timeline.items |
  Select-Object occurredAt, type, summary, stream |
  Format-Table -AutoSize