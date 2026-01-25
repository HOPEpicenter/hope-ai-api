$ErrorActionPreference = "Stop"

function Assert-True([bool]$cond, [string]$msg) {
  if (-not $cond) { throw $msg }
}

function Compare-CursorDesc([string]$prev, [string]$cur) {
  # Returns $true if prev should come BEFORE cur in newest-first ordering.
  # Token format: '<datetime>_<suffix>' (suffix can be RowKey/Guid/etc).
  $p = $prev -split '_' , 2
  $c = $cur  -split '_' , 2
  $pTime = [datetime]::Parse($p[0], [System.Globalization.CultureInfo]::InvariantCulture)
  $cTime = [datetime]::Parse($c[0], [System.Globalization.CultureInfo]::InvariantCulture)
  if ($pTime -gt $cTime) { return $true }
  if ($pTime -lt $cTime) { return $false }
  # tie-breaker: suffix descending (ordinal)
  $pTail = if ($p.Count -gt 1) { $p[1] } else { '' }
  $cTail = if ($c.Count -gt 1) { $c[1] } else { '' }
  return ([string]::CompareOrdinal($pTail, $cTail) -ge 0)
}


function Get-BaseUrl {
  if ($env:HOPE_BASE_URL -and $env:HOPE_BASE_URL.Trim()) { return $env:HOPE_BASE_URL.Trim().TrimEnd("/") }
  return "http://localhost:3000"
}

function Get-Headers {
  if (-not $env:HOPE_API_KEY) { throw "Missing HOPE_API_KEY env var." }
  return @{ "x-api-key" = $env:HOPE_API_KEY }
}

function New-TestVisitor([string]$base, [hashtable]$headers) {
  $stamp = (Get-Date).ToUniversalTime().ToString("yyyyMMddHHmmss")
  $body = @{
    firstName = "John"
    lastName  = "Doe"
    email     = "john+paging-$stamp@example.com"
    phone     = "555-1234"
    source    = "paging"
  } | ConvertTo-Json

  $v = Invoke-RestMethod -Method Post -Uri "$base/api/visitors" -Headers $headers -ContentType "application/json" -Body $body
  return $v.id
}

function Post-Engagement([string]$base, [hashtable]$headers, [string]$visitorId, [string]$note) {
  $body = @{
    visitorId = $visitorId
    type      = "SERVICE_ATTENDED"
    channel   = "in-person"
    notes     = $note
  } | ConvertTo-Json

  return Invoke-RestMethod -Method Post -Uri "$base/api/engagements" -Headers $headers -ContentType "application/json" -Body $body
}

function Get-EngagementsPage([string]$base, [hashtable]$headers, [string]$visitorId, [int]$limit, [string]$cursor) {
  $u = "$base/api/visitors/$visitorId/engagements?limit=$limit"
  if ($cursor -and $cursor.Trim()) { $u = "$u&cursor=$cursor" }
  return Invoke-RestMethod -Method Get -Uri $u -Headers $headers
}

function Get-RowKeyFromItem($it) {
  # Your RowKey is `${occurredAt}_${id}` (stable paging key)
  return "$($it.occurredAt)_$($it.id)"
}

function Assert-NewestFirst($page, [string]$pageName) {
  $items = @($page.items)
  if ($items.Count -le 1) { return }

  for ($i=1; $i -lt $items.Count; $i++) {
    $prev = Get-RowKeyFromItem $items[$i-1]
    $cur  = Get-RowKeyFromItem $items[$i]
    Assert-True ($prev -ge $cur) "$pageName not newest-first at index $i. prev=$prev cur=$cur"
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

# Create 6 engagements with a tiny delay so occurredAt differs
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
