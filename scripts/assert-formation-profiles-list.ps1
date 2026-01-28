param(
  [string]$ApiBase = "http://127.0.0.1:3000/api"
)

$ErrorActionPreference = "Stop"

function Require-Env([string]$name) {
  $v = [Environment]::GetEnvironmentVariable($name)
  if ([string]::IsNullOrWhiteSpace($v)) { throw "Missing required env var: $name" }
  return $v
}

function Invoke-PostJson([string]$uri, [hashtable]$headers, [object]$body) {
  return Invoke-RestMethod -Method Post -Uri $uri -Headers $headers -ContentType "application/json" -Body ($body | ConvertTo-Json -Depth 10)
}

$apiKey = Require-Env "HOPE_API_KEY"
$headers = @{ "x-api-key" = $apiKey }

Write-Host "[assert-formation-profiles-list] ApiBase=$ApiBase"

# create visitor
$email = "formation-profiles+" + (Get-Date -Format "yyyyMMddHHmmss") + "@example.com"
$visitor = Invoke-PostJson -uri "$ApiBase/visitors" -headers $headers -body @{
  firstName = "Formation"
  lastName  = "Profiles"
  email     = $email
}
$visitorId = $visitor.id
if ([string]::IsNullOrWhiteSpace($visitorId)) { throw "Visitor id missing." }
Write-Host "[assert-formation-profiles-list] visitorId=$visitorId"

# generate snapshot via events
$now = (Get-Date).ToUniversalTime()
Invoke-PostJson -uri "$ApiBase/formation/events" -headers $headers -body @{
  id         = [Guid]::NewGuid().ToString()
  visitorId  = $visitorId
  type       = "FOLLOWUP_ASSIGNED"
  occurredAt = $now.ToString("o")
  metadata   = @{ assigneeId = "ops-user-1" }
} | Out-Null

Invoke-PostJson -uri "$ApiBase/formation/events" -headers $headers -body @{
  id         = [Guid]::NewGuid().ToString()
  visitorId  = $visitorId
  type       = "NEXT_STEP_SELECTED"
  occurredAt = $now.AddSeconds(3).ToString("o")
  metadata   = @{ nextStep = "JoinGroup" }
} | Out-Null

Write-Host "[assert-formation-profiles-list] GET /formation/profiles..."
$out = Invoke-RestMethod -Method Get -Uri "$ApiBase/formation/profiles?limit=50&stage=Connected" -Headers $headers
if (-not $out.ok) { throw "Expected ok=true" }

$found = $false
foreach ($p in $out.items) {
  if ($p.visitorId -eq $visitorId) { $found = $true; break }
}
if (-not $found) { throw "Expected visitorId=$visitorId to appear in formation profiles list." }

Write-Host "[assert-formation-profiles-list] OK: formation profiles list assertions passed."