param(
  [Parameter(Mandatory=$true)][string]$BaseUrl,
  [Parameter(Mandatory=$true)][string]$ApiKey
)

$ErrorActionPreference = "Stop"

function PostJson($url, $headers, $body) {
  Invoke-RestMethod -Method Post -Uri $url -Headers $headers -ContentType "application/json" -Body ($body | ConvertTo-Json -Depth 20)
}

function GetJson($url, $headers) {
  Invoke-RestMethod -Method Get -Uri $url -Headers $headers
}

$headers = @{ "x-api-key" = $ApiKey }
$apiBase = $BaseUrl.TrimEnd("/") + "/api"

$email = "rebuild-smoke+" + [Guid]::NewGuid().ToString("N") + "@example.com"
$visitor = PostJson "$apiBase/visitors" $headers @{ name="Formation Rebuild Smoke"; email=$email }
$visitorId = $visitor.visitorId

$base = (Get-Date).ToUniversalTime().AddMinutes(-5)

PostJson "$apiBase/formation/events" $headers @{
  v=1
  eventId="rebuild-assign-" + [Guid]::NewGuid().ToString("N")
  visitorId=$visitorId
  type="FOLLOWUP_ASSIGNED"
  occurredAt=$base.ToString("o")
  source=@{ system="assert-formation-profile-rebuild" }
  data=@{ assigneeId="ops-user-1" }
} | Out-Null

PostJson "$apiBase/formation/events" $headers @{
  v=1
  eventId="rebuild-outcome-" + [Guid]::NewGuid().ToString("N")
  visitorId=$visitorId
  type="FOLLOWUP_OUTCOME_RECORDED"
  occurredAt=$base.AddMinutes(1).ToString("o")
  source=@{ system="assert-formation-profile-rebuild" }
  data=@{ outcome="connected"; notes="rebuild assertion" }
} | Out-Null

$before = GetJson "$apiBase/visitors/$visitorId/formation/profile" $headers
$rebuilt = PostJson "$apiBase/visitors/$visitorId/formation/profile/rebuild" $headers @{}
$after = GetJson "$apiBase/visitors/$visitorId/formation/profile" $headers

if (-not $rebuilt.ok) {
  throw "Rebuild response was not ok"
}

if ($rebuilt.eventCount -lt 2) {
  throw "Expected at least 2 replayed events, got $($rebuilt.eventCount)"
}

if ($after.profile.stage -ne $before.profile.stage) {
  throw "Stage drift after rebuild. Before=$($before.profile.stage), After=$($after.profile.stage)"
}

if ($after.profile.lastEventId -ne $before.profile.lastEventId) {
  throw "lastEventId drift after rebuild. Before=$($before.profile.lastEventId), After=$($after.profile.lastEventId)"
}

if ($after.profile.lastFollowupOutcome -ne "connected") {
  throw "Expected rebuilt outcome connected, got $($after.profile.lastFollowupOutcome)"
}

Write-Host "[assert-formation-profile-rebuild] OK" -ForegroundColor Green
