param(
  [string]$ApiBase = "http://127.0.0.1:3000/api",
  [int]$ListLimit = 50
)


# --- Phase gate: skip Phase 3 asserts unless explicitly enabled ---
if ($env:HOPE_RUN_PHASE3_ASSERTS -ne "1") {
  Write-Host "SKIP: Phase 3 assertions disabled. Set HOPE_RUN_PHASE3_ASSERTS=1 to enable." -ForegroundColor Yellow
  exit 0
}
$ErrorActionPreference = "Stop"

function Require-Env([string]$name) {
  $v = [Environment]::GetEnvironmentVariable($name)
  if ([string]::IsNullOrWhiteSpace($v)) { throw "Missing required env var: $name" }
  return $v
}

function Invoke-PostJson([string]$uri, [hashtable]$headers, [object]$body) {
  return Invoke-RestMethod -Method Post -Uri $uri -Headers $headers -ContentType "application/json" -Body ($body | ConvertTo-Json -Depth 10)
}

function Get-EventKey($e) {
  if ($e.id) { return [string]$e.id }
  if ($e.rowKey) { return [string]$e.rowKey }
  if ($e.RowKey) { return [string]$e.RowKey }
  return ($e | ConvertTo-Json -Depth 6)
}

$apiKey = Require-Env "HOPE_API_KEY"
$headers = @{ "x-api-key" = $apiKey }

Write-Host "[assert-formation-idempotency] ApiBase=$ApiBase"

# create visitor
$email = "formation-idem+" + (Get-Date -Format "yyyyMMddHHmmss") + "@example.com"
$visitor = Invoke-PostJson -uri "$ApiBase/visitors" -headers $headers -body @{
  firstName = "Formation"
  lastName  = "Idem"
  email     = $email
}

$visitorId = $visitor.id
if ([string]::IsNullOrWhiteSpace($visitorId)) { throw "Visitor id missing." }
Write-Host "[assert-formation-idempotency] visitorId=$visitorId"

# create event with client id
$clientId = [Guid]::NewGuid().ToString()
$occurredAt = (Get-Date).ToUniversalTime().ToString("o")

$body = @{
  id         = $clientId
  visitorId  = $visitorId
  type       = "SERVICE_ATTENDED"
  occurredAt = $occurredAt
  source     = "assert-formation-idempotency"
  note       = "idempotency test"
  data       = @{ a = 1 }
}

Write-Host "[assert-formation-idempotency] POST #1 id=$clientId"
$r1 = Invoke-PostJson -uri "$ApiBase/formation/events" -headers $headers -body $body
$k1 = Get-EventKey $r1
if ($k1 -ne $clientId) { throw "Expected POST #1 to return id=$clientId but got key=$k1" }

Write-Host "[assert-formation-idempotency] POST #2 (retry) id=$clientId (expect 200 + existing)"
$r2 = $null
try {
  $r2 = Invoke-PostJson -uri "$ApiBase/formation/events" -headers $headers -body $body
} catch {
  $resp = $_.Exception.Response
  $status = $null
  if ($resp) { try { $status = [int]$resp.StatusCode } catch {} }
  throw "Expected retry to return 200 with existing event, but request failed. status=$status"
}

$k2 = Get-EventKey $r2
if ($k2 -ne $clientId) { throw "Expected retry to return same id=$clientId but got key=$k2" }

# Verify list contains exactly 1
Write-Host "[assert-formation-idempotency] Listing events to verify only one instance exists..."
$list = Invoke-RestMethod -Method Get -Uri "$ApiBase/visitors/$visitorId/formation/events?limit=$ListLimit" -Headers $headers
$items = $null
if ($list -is [System.Array]) { $items = $list } else { $items = $list.items }

if (-not $items) { throw "List returned no items." }

$matches = @($items | Where-Object { (Get-EventKey $_) -eq $clientId })
if ($matches.Count -ne 1) {
  throw "Expected exactly 1 event with id=$clientId in list, found $($matches.Count)"
}

Write-Host "[assert-formation-idempotency] OK: formation idempotency assertions passed."

