[CmdletBinding()]
param(
  [string]$BaseUrl
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

function Require-Env([string]$name) {
  $v = [Environment]::GetEnvironmentVariable($name)
  if ([string]::IsNullOrWhiteSpace($v)) { throw "Missing env var: $name" }
  return $v
}

function Invoke-Json {
  param($Method, $Uri, $Headers, $Body)

  if ($Body) {
    return Invoke-RestMethod -Method $Method -Uri $Uri -Headers $Headers -Body ($Body | ConvertTo-Json -Depth 10) -ContentType "application/json"
  } else {
    return Invoke-RestMethod -Method $Method -Uri $Uri -Headers $Headers
  }
}

$apiKey = Require-Env "HOPE_API_KEY"
$headers = @{ "x-api-key" = $apiKey }
$api = "$BaseUrl/api"

Write-Host "== Journey smoke =="

# Create visitor
$visitor = Invoke-Json POST "$api/visitors" $headers @{
  v = 1
  name = "Journey Test"
  email = "journey+$([guid]::NewGuid().ToString('N'))@example.com"
}

$visitorId = $visitor.visitorId
Write-Host "visitorId=$visitorId"

# Add engagement event
Invoke-Json POST "$api/engagements/events" $headers @{
  v = 1
  eventId = "evt-$([guid]::NewGuid().ToString('N'))"
  visitorId = $visitorId
  type = "note.add"
  occurredAt = (Get-Date).ToUniversalTime().ToString("o")
  source = @{ system = "journey-smoke" }
  data = @{ text = "test" }
}

# Call journey
$journey = Invoke-Json GET "$api/visitors/$visitorId/journey" $headers

Write-Host ($journey | ConvertTo-Json -Depth 10)

if (-not $journey.ok) { throw "journey not ok" }
if (-not $journey.currentStep) { throw "missing currentStep" }
if (-not $journey.sources -or $journey.sources.Count -lt 1) {
  throw "missing sources"
}

Write-Host "Journey OK"
