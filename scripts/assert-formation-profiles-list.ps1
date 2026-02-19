param(
  [string]$ApiBase = "http://127.0.0.1:3000/api"
)

$ErrorActionPreference = "Stop"
function New-FormationEnvelope {
  param(
    [string]$visitorId,
    [string]$type,
    [datetime]$occurredAt,
    [hashtable]$data,
    [string]$sourceSystem
  )

  if (-not $data) { $data = @{} }

  return @{
    v = 1
    eventId = [Guid]::NewGuid().ToString()
    visitorId = $visitorId
    type = $type
    occurredAt = $occurredAt.ToUniversalTime().ToString("o")
    source = @{ system = $sourceSystem }
    data = $data
  }
}

function Require-Env([string]$name) {
  $v = [Environment]::GetEnvironmentVariable($name)
  if ([string]::IsNullOrWhiteSpace($v)) { throw "Missing required env var: $name" }
  return $v
}

function Invoke-PostJson([string]$uri, [hashtable]$headers, [object]$body) {
  return Invoke-RestMethod -Method Post -Uri $uri -Headers $headers -ContentType "application/json" -Body ($body | ConvertTo-Json -Depth 10)
}

function Find-VisitorInPagedList([string]$uriBase, [hashtable]$headers, [string]$visitorId, [int]$pageSize = 200, [int]$maxPages = 10) {
  $cursor = $null
  for ($i=1; $i -le $maxPages; $i++) {
    $uri = $uriBase + "&limit=$pageSize"
    if ($cursor) { $uri += "&cursor=$([Uri]::EscapeDataString($cursor))" }

    $out = Invoke-RestMethod -Method Get -Uri $uri -Headers $headers
    if (-not $out.ok) { throw "Expected ok=true for uri=$uri" }

    foreach ($p in $out.items) {
      if ($p.visitorId -eq $visitorId) { return $true }
    }

    $cursor = $out.cursor
    if ([string]::IsNullOrWhiteSpace($cursor)) { break }
  }
  return $false
}

$apiKey = Require-Env "HOPE_API_KEY"
$headers = @{ "x-api-key" = $apiKey }

# Detect dev storage (Azurite) to avoid flaky list/paging semantics
$storageCs = [Environment]::GetEnvironmentVariable("STORAGE_CONNECTION_STRING")
$usingDevStorage =
  ($storageCs -match "UseDevelopmentStorage=true") -or
  ($storageCs -match "127\.0\.0\.1:10002") -or
  ($storageCs -match "localhost:10002")

Write-Host "[assert-formation-profiles-list] ApiBase=$ApiBase usingDevStorage=$usingDevStorage"

# create visitor
$email = "formation-profiles+" + (Get-Date -Format "yyyyMMddHHmmss") + "@example.com"
$visitor = Invoke-PostJson -uri "$ApiBase/visitors" -headers $headers -body @{
  firstName = "Formation"
  lastName  = "Profiles"
  email     = $email
}
$visitorId = $visitor.visitorId; if ([string]::IsNullOrWhiteSpace($visitorId)) { $visitorId = $visitor.id }
if ([string]::IsNullOrWhiteSpace($visitorId)) { throw "Visitor id missing." }
Write-Host "[assert-formation-profiles-list] visitorId=$visitorId"

# generate snapshot via events (moves stage -> Connected + assignedTo)
$now = (Get-Date).ToUniversalTime()
$body = @{
  id         = [Guid]::NewGuid().ToString()
  visitorId  = $visitorId
  type       = "FOLLOWUP_ASSIGNED"
  occurredAt = $now.ToString("o")
  metadata   = @{ assigneeId = "ops-user-1" }
}

$evt = @{
  v = 1
  eventId = $body.id
  visitorId = $body.visitorId
  type = $body.type
  occurredAt = $body.occurredAt
  source = @{ system = "assert-formation-profiles-list" }
  data = $body.metadata
}

Invoke-PostJson -uri "$ApiBase/formation/events" -headers $headers -body $evt | Out-Null

$body = @{
  id         = [Guid]::NewGuid().ToString()
  visitorId  = $visitorId
  type       = "NEXT_STEP_SELECTED"
  occurredAt = $now.AddSeconds(3).ToString("o")
  metadata   = @{ nextStep = "JoinGroup" }
}

$evt = @{
  v = 1
  eventId = $body.id
  visitorId = $body.visitorId
  type = $body.type
  occurredAt = $body.occurredAt
  source = @{ system = "assert-formation-profiles-list" }
  data = $body.metadata
}

Invoke-PostJson -uri "$ApiBase/formation/events" -headers $headers -body $evt | Out-Null

# 1) visitorId fast path should return the single profile (deterministic)
Write-Host "[assert-formation-profiles-list] GET /formation/profiles (visitorId fast path)..."
$out1 = Invoke-RestMethod -Method Get -Uri "$ApiBase/formation/profiles?visitorId=$visitorId" -Headers $headers
if (-not $out1.ok) { throw "Expected ok=true (visitorId fast path)" }
if (($out1.items | Measure-Object).Count -ne 1) { throw "Expected exactly 1 item for visitorId fast path." }
if ($out1.items[0].visitorId -ne $visitorId) { throw "Expected visitorId match on returned item." }

# 2) stage filter
Write-Host "[assert-formation-profiles-list] GET /formation/profiles (stage=Connected)..."
if ($usingDevStorage) {
  # On Azurite, just ensure endpoint responds and shape is valid (do not require finding a specific visitor).
  $out2 = Invoke-RestMethod -Method Get -Uri "$ApiBase/formation/profiles?stage=Connected&limit=10" -Headers $headers
  if (-not $out2.ok) { throw "Expected ok=true (stage filter)" }
  if ($null -eq $out2.items) { throw "Expected items array (stage filter)" }
  Write-Host "[assert-formation-profiles-list] SKIP: stage paging presence assert on dev storage." -ForegroundColor Yellow
} else {
  $found2 = Find-VisitorInPagedList -uriBase "$ApiBase/formation/profiles?stage=Connected" -headers $headers -visitorId $visitorId
  if (-not $found2) { throw "Expected visitorId=$visitorId to appear in stage=Connected list (after paging)." }
}

# 3) assignedTo filter
Write-Host "[assert-formation-profiles-list] GET /formation/profiles (assignedTo=ops-user-1)..."
if ($usingDevStorage) {
  $out3 = Invoke-RestMethod -Method Get -Uri "$ApiBase/formation/profiles?assignedTo=ops-user-1&limit=10" -Headers $headers
  if (-not $out3.ok) { throw "Expected ok=true (assignedTo filter)" }
  if ($null -eq $out3.items) { throw "Expected items array (assignedTo filter)" }
  Write-Host "[assert-formation-profiles-list] SKIP: assignedTo paging presence assert on dev storage." -ForegroundColor Yellow
} else {
  $found3 = Find-VisitorInPagedList -uriBase "$ApiBase/formation/profiles?assignedTo=ops-user-1" -headers $headers -visitorId $visitorId
  if (-not $found3) { throw "Expected visitorId=$visitorId to appear in assignedTo list (after paging)." }
}

Write-Host "[assert-formation-profiles-list] OK: formation profiles list assertions passed." -ForegroundColor Green