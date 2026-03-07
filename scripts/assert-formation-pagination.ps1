param(
  [string]$ApiBase = "http://127.0.0.1:3000/api",
  [int]$Limit = 5
)


# --- Phase gate: skip Phase 3 asserts unless explicitly enabled ---
if ($env:HOPE_RUN_PHASE3_ASSERTS -ne "1") {
  Write-Host "SKIP: Phase 3 assertions disabled. Set HOPE_RUN_PHASE3_ASSERTS=1 to enable." -ForegroundColor Yellow
  exit 0
}
$ErrorActionPreference = "Stop"

# Optional deep paging mode (kept behind its own flag to avoid slowing normal runs)
$deepPaging = ($env:HOPE_RUN_PHASE3_DEEP_PAGING -eq "1")
if ($deepPaging) {
  Write-Host "[assert-formation-pagination] Deep paging mode ENABLED (HOPE_RUN_PHASE3_DEEP_PAGING=1)" -ForegroundColor Cyan
}

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

$visitorId = $visitor.visitorId; if ([string]::IsNullOrWhiteSpace($visitorId)) { $visitorId = $visitor.id }
if ([string]::IsNullOrWhiteSpace($visitorId)) { throw "Visitor id missing from response." }
Write-Host "[assert-formation-pagination] visitorId=$visitorId"

# --- Create formation events (make enough for 2 pages)
# NOTE: keep payload conservative so it matches your current server validation.
$createCount = if ($deepPaging) {
  # force multiple pages even when Limit is small
  [Math]::Max($Limit * 8 + 3, 25)
} else {
  # enough for 2 pages
  [Math]::Max($Limit * 2 + 2, 12)
}
Write-Host "[assert-formation-pagination] Creating $createCount formation events..."

1..$createCount | ForEach-Object {
  $n = $_
  $occurredAt = (Get-Date).ToUniversalTime().AddMilliseconds($n).ToString("o")

  $evt = @{
    v          = 1
    eventId    = ("evt-formation-pagination-" + [Guid]::NewGuid().ToString("N"))
    visitorId  = $visitorId
    type       = "FOLLOWUP_CONTACTED"
    occurredAt = $occurredAt
    source     = @{ system = "assert-formation-pagination" }
    data       = @{
      method = "sms"
      result = "reached"
      n      = $n
    }
  }

  try {
    Invoke-RestMethod -Method Post -Uri "$ApiBase/formation/events" -Headers $headers -ContentType "application/json" -Body ($evt | ConvertTo-Json -Depth 10) | Out-Null
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

function Get-EventKey($e) {
  if ($e.id) { return [string]$e.id }
  if ($e.eventId) { return [string]$e.eventId }
  if ($e.rowKey) { return [string]$e.rowKey }
  if ($e.RowKey) { return [string]$e.RowKey }
  return ($e | ConvertTo-Json -Depth 6)
}

function Get-TimeIso($e) {
  if ($e.occurredAt) { return [string]$e.occurredAt }
  if ($e.createdAt) { return [string]$e.createdAt }
  if ($e.timestamp) { return [string]$e.timestamp }
  return $null
}

function Assert-NewestFirst($items, [string]$label) {
  $times = $items | ForEach-Object { Get-TimeIso $_ } | Where-Object { $_ }
  if ($times.Count -ge 2) {
    for ($i = 0; $i -lt $times.Count - 1; $i++) {
      $a = [DateTime]::Parse($times[$i]).ToUniversalTime()
      $b = [DateTime]::Parse($times[$i + 1]).ToUniversalTime()
      if ($a -lt $b) {
        throw "[$label] Expected newest-first ordering but found $($times[$i]) < $($times[$i + 1]) at index $i"
      }
    }
  }
}

function Assert-NoOverlap($left, $right, [string]$label) {
  $seen = @{}
  foreach ($item in $left) {
    $seen[(Get-EventKey $item)] = $true
  }

  foreach ($item in $right) {
    $key = Get-EventKey $item
    if ($seen.ContainsKey($key)) {
      throw "[$label] Duplicate item found across pages: $key"
    }
  }
}

if ($deepPaging) {
  # Deep paging: walk pages until cursor exhausts (or safety max pages)

  $seen = @{}
  $allCount = 0
  $pageNo = 1
  $cursor = $cursor1
  $maxPages = 50

  foreach ($e in $items1) {
    $k = Get-EventKey $e
    if ($seen.ContainsKey($k)) { throw "Duplicate detected on page1: $k" }
    $seen[$k] = $true
    $allCount++
  }
  Assert-NewestFirst $items1 "page1"

  while (-not [string]::IsNullOrWhiteSpace($cursor) -and $pageNo -lt $maxPages) {
    $pageNo++
    Write-Host "[assert-formation-pagination] Listing page$pageNo..."
    $p = Invoke-RestMethod -Method Get -Uri "$ApiBase/visitors/$visitorId/formation/events?limit=$Limit&cursor=$([Uri]::EscapeDataString($cursor))" -Headers $headers

    $items = $null
    $next = $null
    if ($p -is [System.Array]) {
      $items = $p
    } else {
      $items = $p.items
      $next = $p.nextCursor
      if (-not $next) { $next = $p.cursor }
    }

    if ($null -eq $items) {
  $raw = $p | ConvertTo-Json -Depth 10
  throw "page$pageNo missing ''items''. Response: $raw"
}
    Assert-NewestFirst $items "page$pageNo"

    foreach ($e in $items) {
      $k = Get-EventKey $e
      if ($seen.ContainsKey($k)) { throw "Duplicate detected across deep paging: $k" }
      $seen[$k] = $true
      $allCount++
    }

    if ($next -and $next -eq $cursor) { throw "Cursor did not progress at page$pageNo (next==current)." }
    $cursor = $next

    if ($items.Count -lt $Limit) { break }
  }

  if ($allCount -lt ($Limit * 3)) { throw "Deep paging did not traverse enough items (count=$allCount)." }

  Write-Host "[assert-formation-pagination] OK: formation pagination assertions passed." -ForegroundColor Green
  exit 0
}

# --- List page 2 using cursor
Write-Host "[assert-formation-pagination] Listing page2..."
$page2 = Invoke-RestMethod -Method Get -Uri "$ApiBase/visitors/$visitorId/formation/events?limit=$Limit&cursor=$([Uri]::EscapeDataString($cursor1))" -Headers $headers
$items2 = $null
if ($page2 -is [System.Array]) { $items2 = $page2 } else { $items2 = $page2.items }
if (-not $items2) { throw "page2 items missing." }
if ($items2.Count -ne $Limit) { throw "Expected page2 count=$Limit but got $($items2.Count)" }

Write-Host "[assert-formation-pagination] page2 count=$($items2.Count)"

Assert-NewestFirst $items1 "page1"
Assert-NewestFirst $items2 "page2"
Assert-NoOverlap $items1 $items2 "page1-page2"

Write-Host "[assert-formation-pagination] OK: formation pagination assertions passed." -ForegroundColor Green
