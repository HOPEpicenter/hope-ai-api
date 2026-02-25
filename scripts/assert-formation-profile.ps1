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

Write-Host "[assert-formation-profile] ApiBase=$ApiBase"

# create visitor
$email = "formation-profile+" + (Get-Date -Format "yyyyMMddHHmmss") + "@example.com"
$visitor = Invoke-PostJson -uri "$ApiBase/visitors" -headers $headers -body @{
  firstName = "Formation"
  lastName  = "Profile"
  email     = $email
}
$visitorId = $visitor.id
if ([string]::IsNullOrWhiteSpace($visitorId)) { throw "Visitor id missing." }
Write-Host "[assert-formation-profile] visitorId=$visitorId"

# post events that should advance stage deterministically (based on recordFormationEvent rules)
$now = (Get-Date).ToUniversalTime()
$e1 = @{
  id         = [Guid]::NewGuid().ToString()
  visitorId  = $visitorId
  type       = "FOLLOWUP_ASSIGNED"
  occurredAt = $now.ToString("o")
  metadata   = @{ assigneeId = "ops-user-1" }
}
Invoke-PostJson -uri "$ApiBase/formation/events" -headers $headers -body $e1 | Out-Null

$e2 = @{
  id         = [Guid]::NewGuid().ToString()
  visitorId  = $visitorId
  type       = "NEXT_STEP_SELECTED"
  occurredAt = $now.AddSeconds(5).ToString("o")
  metadata   = @{ nextStep = "JoinGroup" }
}
Invoke-PostJson -uri "$ApiBase/formation/events" -headers $headers -body $e2 | Out-Null

# fetch profile
Write-Host "[assert-formation-profile] GET profile..."
$p = Invoke-RestMethod -Method Get -Uri "$ApiBase/visitors/$visitorId/formation/profile" -Headers $headers
if (-not $p.ok) { throw "Expected ok=true from profile endpoint." }
if (-not $p.profile) { throw "Expected profile to exist after posting events." }

# minimal required snapshot fields (dashboard contract)
if ([string]::IsNullOrWhiteSpace([string]$p.profile.rowKey)) { throw "Profile rowKey missing." }
if ([string]::IsNullOrWhiteSpace([string]$p.profile.partitionKey)) { throw "Profile partitionKey missing." }
if ($p.profile.partitionKey -ne "VISITOR") { throw "Expected profile.partitionKey=VISITOR, got $($p.profile.partitionKey)" }
if ($p.profile.rowKey -ne $visitorId) { throw "Expected profile.rowKey=visitorId, got $($p.profile.rowKey)" }

if ([string]::IsNullOrWhiteSpace([string]$p.profile.lastEventType)) { throw "Expected lastEventType to be set." }
if ([string]::IsNullOrWhiteSpace([string]$p.profile.lastEventAt)) { throw "Expected lastEventAt to be set." }
if ([string]::IsNullOrWhiteSpace([string]$p.profile.updatedAt)) { throw "Expected updatedAt to be set." }

# stage should be Connected after NEXT_STEP_SELECTED
if ($p.profile.stage -ne "Connected") { throw "Expected stage=Connected after NEXT_STEP_SELECTED, got $($p.profile.stage)" }

Write-Host "[assert-formation-profile] OK: formation profile snapshot assertions passed."

