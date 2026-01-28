param(
  [string]$ApiBase = "http://127.0.0.1:3000/api",
  [int]$Limit = 5
)

$ErrorActionPreference = "Stop"

function Require-Env([string]$name) {
  $v = [Environment]::GetEnvironmentVariable($name)
  if ([string]::IsNullOrWhiteSpace($v)) { throw "Missing required env var: $name" }
  return $v
}

$apiKey = Require-Env "HOPE_API_KEY"
$headers = @{ "x-api-key" = $apiKey }

Write-Host "[assert-formation-pagination] ApiBase=$ApiBase Limit=$Limit"

# --- Create a visitor
$email = "formation+" + (Get-Date -Format "yyyyMMddHHmmss") + "@example.com"
Write-Host "[assert-formation-pagination] Creating visitor..."
$visitor = Invoke-RestMethod -Method Post -Uri "$ApiBase/visitors" -Headers $headers -ContentType "application/json" -Body (@{
  firstName = "Formation"
  lastName  = "Paging"
  email     = $email
} | ConvertTo-Json -Depth 10)

$visitorId = $visitor.id
if ([string]::IsNullOrWhiteSpace($visitorId)) { throw "Visitor id missing from response." }
Write-Host "[assert-formation-pagination] visitorId=$visitorId"

# --- Create formation events (make enough for 2 pages)
# NOTE: keep payload conservative so it matches your current server validation.
$createCount = [Math]::Max($Limit * 2 + 2, 12)
Write-Host "[assert-formation-pagination] Creating $createCount formation events..."

1..$createCount | ForEach-Object {
  $n = $_
  # ensure unique timestamps (helps ordering determinism even if server uses occurredAt)
  $occurredAt = (Get-Date).ToUniversalTime().AddMilliseconds($n).ToString("o")

  $body = @{
    visitorId   = $visitorId
    type        = "SERVICE_ATTENDED"               # safe default; adjust later if you enforce enums
    occurredAt  = $occurredAt
    source      = "assert-formation-pagination"
    note        = "formation event $n" # if your API uses "NOTE"
    data        = @{ n = $n }          # if your API uses generic payload "data"
  }

  try {
    Invoke-RestMethod -Method Post -Uri "$ApiBase/formation/events" -Headers $headers -ContentType "application/json" -Body ($body | ConvertTo-Json -Depth 10) | Out-Null
  } catch {
    $resp = $_.Exception.Response
    if ($resp) {
      try {
        $reader = New-Object System.IO.StreamReader($resp.GetResponseStream())
        $errBody = $reader.ReadToEnd()
        Write-Host "[assert-formation-pagination] POST failed body: $errBody"
      } catch {}
    }
    throw
  }
}

# --- List page 1 (newest-first)
Write-Host "[assert-formation-pagination] Listing page1..."
$page1 = Invoke-RestMethod -Method Get -Uri "$ApiBase/visitors/$visitorId/formation/events?limit=$Limit" -Headers $headers

# Support either envelope { items, nextCursor } or raw array
$items1 = $null
$cursor1 = $null

if ($page1 -is [System.Array]) {
  $items1 = $page1
} else {
  $items1 = $page1.items
  $cursor1 = $page1.nextCursor
}

if (-not $items1) { throw "page1 items missing." }
if ($items1.Count -ne $Limit) { throw "Expected page1 count=$Limit but got $($items1.Count)" }
if ([string]::IsNullOrWhiteSpace($cursor1)) {
  # If your endpoint returns cursor in a different field, add it here
  if ($page1.cursor) { $cursor1 = $page1.cursor }
}
if ([string]::IsNullOrWhiteSpace($cursor1)) { throw "Expected nextCursor/cursor from page1 but it was empty." }

Write-Host "[assert-formation-pagination] page1 count=$($items1.Count) cursor=$cursor1"

# --- List page 2 using cursor
Write-Host "[assert-formation-pagination] Listing page2..."
$page2 = Invoke-RestMethod -Method Get -Uri "$ApiBase/visitors/$visitorId/formation/events?limit=$Limit&cursor=$([Uri]::EscapeDataString($cursor1))" -Headers $headers
$items2 = $null
if ($page2 -is [System.Array]) { $items2 = $page2 } else { $items2 = $page2.items }
if (-not $items2) { throw "page2 items missing." }
if ($items2.Count -ne $Limit) { throw "Expected page2 count=$Limit but got $($items2.Count)" }

Write-Host "[assert-formation-pagination] page2 count=$($items2.Count)"

# --- Assert no overlap by id (or RowKey)
function Get-EventKey($e) {
  if ($e.id) { return [string]$e.id }
  if ($e.rowKey) { return [string]$e.rowKey }
  if ($e.RowKey) { return [string]$e.RowKey }
  # fallback: stringify minimal stable fields
  return ($e | ConvertTo-Json -Depth 6)
}

$keys1 = @{}
$items1 | ForEach-Object { $keys1[(Get-EventKey $_)] = $true }

$overlap = @()
$items2 | ForEach-Object {
  $k = Get-EventKey $_
  if ($keys1.ContainsKey($k)) { $overlap += $k }
}

if ($overlap.Count -gt 0) {
  throw "Overlap detected between pages: $((( $overlap | Select-Object -First 3 ) -join ', '))"
}

# --- Basic newest-first ordering check on occurredAt/createdAt if present
function Get-TimeIso($e) {
  if ($e.occurredAt) { return [string]$e.occurredAt }
  if ($e.createdAt) { return [string]$e.createdAt }
  if ($e.timestamp) { return [string]$e.timestamp }
  return $null
}

$times1 = $items1 | ForEach-Object { Get-TimeIso $_ } | Where-Object { $_ }
if ($times1.Count -ge 2) {
  for ($i=0; $i -lt $times1.Count-1; $i++) {
    $a = [DateTime]::Parse($times1[$i]).ToUniversalTime()
    $b = [DateTime]::Parse($times1[$i+1]).ToUniversalTime()
    if ($a -lt $b) { throw "Expected newest-first ordering but found $($times1[$i]) < $($times1[$i+1]) at index $i" }
  }
}

Write-Host "[assert-formation-pagination] OK: formation pagination assertions passed."