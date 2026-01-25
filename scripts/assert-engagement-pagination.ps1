# .\scripts\assert-engagement-pagination.ps1
$ErrorActionPreference = "Stop"

function Assert-True([bool]$cond, [string]$msg) {
  if (-not $cond) { throw $msg }
}

function Get-BaseUrl {
  if ($env:HOPE_BASE_URL -and $env:HOPE_BASE_URL.Trim()) {
    return $env:HOPE_BASE_URL.Trim().TrimEnd("/")
  }
  return "http://localhost:3000"
}

function Get-ApiBase([string]$base) {
  # Allow HOPE_BASE_URL to be either http://host:port OR http://host:port/api
  if ($base.ToLower().EndsWith("/api")) { return $base }
  return ($base.TrimEnd("/") + "/api")
}

function Get-Headers {
  if (-not $env:HOPE_API_KEY) { throw "Missing HOPE_API_KEY env var." }
  return @{ "x-api-key" = $env:HOPE_API_KEY }
}

function Invoke-Json([string]$method, [string]$uri, [hashtable]$headers, $body) {
  if ($null -eq $body) {
    return Invoke-RestMethod -Method $method -Uri $uri -Headers $headers
  }
  $json = $body | ConvertTo-Json -Depth 20
  return Invoke-RestMethod -Method $method -Uri $uri -Headers $headers -ContentType "application/json" -Body $json
}

function New-TestVisitor([string]$base, [hashtable]$headers) {
  $api = Get-ApiBase $base
  $stamp = (Get-Date).ToString("yyyyMMddHHmmssfff")
  $payload = @{
    firstName = "Paging"
    lastName  = "Test"
    email     = "paging+$stamp@example.com"
    phone     = "555-0000"
    notes     = "assert-engagement-pagination"
    tags      = @("paging-test")
  }
  $v = Invoke-Json -method "Post" -uri "$api/visitors" -headers $headers -body $payload

  # Be flexible: some APIs return { id: ... }, others return { visitorId: ... }
  $id = $null
  if ($v.PSObject.Properties.Name -contains "id") { $id = $v.id }
  elseif ($v.PSObject.Properties.Name -contains "visitorId") { $id = $v.visitorId }

  Assert-True ([bool]$id) "Visitor create did not return id. Response: $($v | ConvertTo-Json -Depth 10)"
  return [string]$id
}

function Post-Engagement([string]$base, [hashtable]$headers, [string]$visitorId, [string]$note) {
  $api = Get-ApiBase $base
  $payload = @{ note = $note }
  return Invoke-Json -method "Post" -uri "$api/visitors/$visitorId/engagements" -headers $headers -body $payload
}

function Get-EngagementsPage([string]$base, [hashtable]$headers, [string]$visitorId, [int]$limit, [string]$cursor) {
  $api = Get-ApiBase $base
  $u = "$api/visitors/$visitorId/engagements?limit=$limit"
  if ($cursor -and $cursor.Trim()) {
    $u += "&cursor=" + [uri]::EscapeDataString($cursor)
  }
  return Invoke-RestMethod -Method Get -Uri $u -Headers $headers
}

function Get-RowKeyFromItem($it) {
  # Cursor/order key used by API: occurredAt first, then id (stable)
  # Example seen in CI failure: "01/25/2026 20:58:16_<guid>"
  return "$($it.occurredAt)_$($it.id)"
}

function Assert-NewestFirst($page, [string]$label) {
  $items = @($page.items)
  for ($i = 1; $i -lt $items.Count; $i++) {
    $prevRk = Get-RowKeyFromItem $items[$i-1]
    $curRk  = Get-RowKeyFromItem $items[$i]

    # Newest-first means RowKey DESC (tie-safe).
    Assert-True (
      ([string]::CompareOrdinal($prevRk, $curRk) -ge 0)
    ) ("{0} not newest-first at index {1}. prev={2} cur={3}" -f $label, $i, $prevRk, $curRk)
  }
}

function Assert-NoOverlap($p1, $p2) {
  $ids1 = @($p1.items | ForEach-Object { $_.id })
  $ids2 = @($p2.items | ForEach-Object { $_.id })
  $overlap = @($ids1 | Where-Object { $ids2 -contains $_ })
  Assert-True ($overlap.Count -eq 0) ("Overlap detected between pages: " + ($overlap -join ", "))
}

function Assert-StrictlyOlderThanCursor($page, [string]$cursor) {
  foreach ($it in @($page.items)) {
    $rk = Get-RowKeyFromItem $it
    Assert-True ($rk -lt $cursor) "Found item not older than cursor (cursor must be exclusive upper bound). rk=$rk cursor=$cursor"
  }
}

# ======== RUN ========
$base = Get-BaseUrl
$headers = Get-Headers

Write-Host "== Assert Engagement Pagination ==" -ForegroundColor Cyan
Write-Host "BaseUrl=$base"

$vid = New-TestVisitor -base $base -headers $headers
Write-Host "VisitorId=$vid"

# Create 6 engagements with a tiny delay so occurredAt differs (but ties can still happen in CI -> tie-safe checks)
1..6 | ForEach-Object {
  Post-Engagement -base $base -headers $headers -visitorId $vid -note "paging-test $_" | Out-Null
  Start-Sleep -Milliseconds 15
}

$limit = 3

$p1 = Get-EngagementsPage -base $base -headers $headers -visitorId $vid -limit $limit -cursor ""
Assert-True ($p1.items.Count -le $limit) "Page1 returned more than limit."
Assert-True ($p1.nextCursor -and $p1.nextCursor.Trim()) "Page1 missing nextCursor."
Assert-NewestFirst $p1 "Page1"

$cursor = $p1.nextCursor

$p2 = Get-EngagementsPage -base $base -headers $headers -visitorId $vid -limit $limit -cursor $cursor
Assert-True ($p2.items.Count -le $limit) "Page2 returned more than limit."
Assert-NewestFirst $p2 "Page2"

Assert-NoOverlap $p1 $p2
Assert-StrictlyOlderThanCursor $p2 $cursor

Write-Host "OK: paging assertions passed (no overlap, cursor exclusive upper-bound, newest-first)" -ForegroundColor Green
