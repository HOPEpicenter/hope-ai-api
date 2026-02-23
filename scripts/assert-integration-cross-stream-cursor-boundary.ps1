param(
  [Parameter(Mandatory=$false)]
  [string]$BaseUrl = $env:HOPE_BASE_URL,

  [Parameter(Mandatory=$false)]
  [string]$ApiKey = $env:HOPE_API_KEY
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

function Assert-True([bool]$cond, [string]$msg) {
  if (-not $cond) { throw "ASSERT FAIL: $msg" }
}

if ([string]::IsNullOrWhiteSpace($BaseUrl)) { $BaseUrl = "http://localhost:3000" }

# Reuse the existing integration stress script because it already knows:
# - how to create visitor
# - how to append engagement events
# - how to append formation events
# - which integration timeline endpoint to call and what headers to send
. "$PSScriptRoot\stress-integration-timeline-paging.ps1"

# --- Hard boundary condition: SAME occurredAt across BOTH streams ---
$T = (Get-Date).ToUniversalTime().AddMinutes(-10)
$occurredAt = $T.ToString("o")

Write-Host "Cross-stream boundary regression: occurredAt=$occurredAt"

# 1) Create visitor (use the stress script’s helper if it has one; otherwise fall back)
if (Get-Command New-TestVisitor -ErrorAction SilentlyContinue) {
  $visitorId = New-TestVisitor -BaseUrl $BaseUrl -ApiKey $ApiKey
} else {
  # fallback: try the public visitors endpoint shape used by smoke
  $headers = @{}
  if ($ApiKey) { $headers["x-api-key"] = $ApiKey }
  $resp = Invoke-RestMethod -Method POST -Uri "$BaseUrl/api/visitors" -Headers $headers -ContentType "application/json" -Body (@{ name="crossstream"; email=("crossstream+" + [guid]::NewGuid().ToString("n") + "@example.com") } | ConvertTo-Json)
  $visitorId = $resp.visitorId
}
Assert-True (-not [string]::IsNullOrWhiteSpace($visitorId)) "visitorId should be created"

# 2) Seed: 2 engagement events at same occurredAt
# 3) Seed: 2 formation events at same occurredAt
# We intentionally make multiple items per stream at the exact same timestamp to force the cursor translation boundary.
if (-not (Get-Command Add-EngagementEvent -ErrorAction SilentlyContinue)) {
  throw "stress-integration-timeline-paging.ps1 must expose Add-EngagementEvent / Add-FormationEvent helpers (or similar). Open it and export those helpers so this assert can reuse them."
}
if (-not (Get-Command Add-FormationEvent -ErrorAction SilentlyContinue)) {
  throw "stress-integration-timeline-paging.ps1 must expose Add-FormationEvent helper (or similar)."
}

$e1 = Add-EngagementEvent -BaseUrl $BaseUrl -ApiKey $ApiKey -VisitorId $visitorId -OccurredAt $occurredAt -Type "note.add" -Data @{ text="E1" }
$e2 = Add-EngagementEvent -BaseUrl $BaseUrl -ApiKey $ApiKey -VisitorId $visitorId -OccurredAt $occurredAt -Type "note.add" -Data @{ text="E2" }

$f1 = Add-FormationEvent  -BaseUrl $BaseUrl -ApiKey $ApiKey -VisitorId $visitorId -OccurredAt $occurredAt -Type "formation.note" -Data @{ text="F1" }
$f2 = Add-FormationEvent  -BaseUrl $BaseUrl -ApiKey $ApiKey -VisitorId $visitorId -OccurredAt $occurredAt -Type "formation.note" -Data @{ text="F2" }

# 4) Page with limit=1 until exhausted
$seen = New-Object "System.Collections.Generic.HashSet[string]"
$items = New-Object System.Collections.Generic.List[object]
$cursor = $null
$page = 0

while ($true) {
  $page++
  $res = Get-IntegrationTimeline -BaseUrl $BaseUrl -ApiKey $ApiKey -VisitorId $visitorId -Limit 1 -Cursor $cursor

  Assert-True ($res -ne $null) "integration timeline response should not be null"
  Assert-True ($res.items.Count -le 1) "limit=1 must return <=1 item"

  if ($res.items.Count -eq 0) { break }

  $it = $res.items[0]
  $k = "{0}:{1}" -f [string]$it.stream, [string]$it.eventId

  Assert-True (-not [string]::IsNullOrWhiteSpace([string]$it.stream)) "item.stream must be present"
  Assert-True (-not [string]::IsNullOrWhiteSpace([string]$it.eventId)) "item.eventId must be present"
  Assert-True (-not [string]::IsNullOrWhiteSpace([string]$it.occurredAt)) "item.occurredAt must be present"

  Assert-True ($seen.Add($k)) "duplicate item observed at page=$page key=$k"
  $items.Add($it) | Out-Null

  # monotonic non-increasing occurredAt (newest-first paging)
  if ($items.Count -ge 2) {
    $a = [DateTimeOffset]::Parse($items[$items.Count-2].occurredAt).ToUnixTimeMilliseconds()
    $b = [DateTimeOffset]::Parse($items[$items.Count-1].occurredAt).ToUnixTimeMilliseconds()
    Assert-True ($b -le $a) "paging went forward in time (prev=$($items[$items.Count-2].occurredAt), cur=$($items[$items.Count-1].occurredAt))"
  }

  $cursor = $res.nextCursor
  if ([string]::IsNullOrWhiteSpace($cursor)) { break }
}

# 5) Must have exactly 4 unique items
Assert-True ($items.Count -eq 4) "expected 4 total items, got $($items.Count)"

# 6) Cross-stream boundary specific check:
# Ensure we saw BOTH streams at the exact same occurredAt
$streamsAtT = $items | Where-Object { $_.occurredAt -eq $occurredAt } | Select-Object -ExpandProperty stream
Assert-True (($streamsAtT -contains "engagement") -and ($streamsAtT -contains "formation")) "must include both engagement and formation at the boundary timestamp"

Write-Host "OK: Cross-stream cursor boundary regression passed (items=$($items.Count))"