param(
  [string]$ApiBaseUrl = "http://127.0.0.1:3000/api",
  [string]$ApiKey = $env:HOPE_API_KEY
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

function Assert-True([bool]$cond, [string]$msg) {
  if (-not $cond) { throw "ASSERT FAIL: $msg" }
}

if ([string]::IsNullOrWhiteSpace($ApiKey)) {
  throw "HOPE_API_KEY is required"
}

$headers = @{ "x-api-key" = $ApiKey }

Write-Host "=== ASSERT: Global unified timeline (mixed stream + cursor) ==="

# Page 1
$r1 = Invoke-RestMethod -Method GET -Uri "$ApiBaseUrl/integration/timeline/global?limit=5" -Headers $headers

Assert-True ($r1.ok -eq $true) "expected ok=true"

$items1 = @($r1.items)
Assert-True ($items1.Count -ge 1) "expected at least 1 item"

# Ensure streams present (soft check)
$streams = @($items1 | ForEach-Object { [string]$_.stream })
Assert-True ($streams.Count -ge 1) "expected stream data"

# Ensure ordering (newest first)
$times = @($items1 | ForEach-Object { [DateTimeOffset]::Parse([string]$_.occurredAt).ToUnixTimeMilliseconds() })
for ($i = 1; $i -lt $times.Count; $i++) {
  Assert-True ($times[$i - 1] -ge $times[$i]) "not sorted newest-first"
}

# Cursor test (if present)
if ($null -ne $r1.nextCursor -and $r1.nextCursor -ne "") {
  $cursor = [uri]::EscapeDataString([string]$r1.nextCursor)

  $r2 = Invoke-RestMethod -Method GET -Uri "$ApiBaseUrl/integration/timeline/global?limit=5&cursor=$cursor" -Headers $headers
  Assert-True ($r2.ok -eq $true) "page2 expected ok=true"

  $items2 = @($r2.items)
  Assert-True ($items2.Count -ge 1) "page2 expected items"

  $ids1 = @($items1 | ForEach-Object { [string]$_.eventId })
  $ids2 = @($items2 | ForEach-Object { [string]$_.eventId })

  $overlap = @($ids1 | Where-Object { $ids2 -contains $_ })
  Assert-True ($overlap.Count -eq 0) "overlap across pages detected"
}

Write-Host "OK: global unified timeline regression passed." -ForegroundColor Green


Write-Host "=== ASSERT: Large page (limit=50) ==="

$rLarge = Invoke-RestMethod `
  -Method GET `
  -Uri "$ApiBaseUrl/integration/timeline/global?limit=50" `
  -Headers $headers

if (-not $rLarge.ok) {
  throw "Expected ok=true for limit=50"
}

if (@($rLarge.items).Count -lt 40) {
  throw "Expected at least 40 items for limit=50"
}

Write-Host "OK: large page (limit=50) passed."

