param(
  [Parameter(Mandatory=$true)][string]$BaseUrl,
  [Parameter(Mandatory=$true)][string]$ApiKey
)

$ErrorActionPreference = "Stop"
$headers = @{ "x-api-key" = $ApiKey }

function Fail([string]$msg) { throw "[assert-formation-pagination] $msg" }

# 1) Create visitor
$visitor = Invoke-RestMethod -Method Post -Uri "$BaseUrl/api/visitors" -Headers $headers -ContentType "application/json" -Body (@{
  firstName = "Formation"
  lastName  = "Test"
  email     = ("formation+" + (Get-Date -Format "yyyyMMddHHmmss") + "@example.com")
} | ConvertTo-Json -Depth 10)

if (-not $visitor.id) { Fail "Visitor create did not return id" }
$vid = $visitor.id

# 2) Create 5 formation events with controlled occurredAt (1-minute apart)
for ($i=0; $i -lt 5; $i++) {
  $occurredAt = (Get-Date).ToUniversalTime().AddMinutes(-$i).ToString("o")
  $resp = Invoke-RestMethod -Method Post -Uri "$BaseUrl/api/formation/events" -Headers $headers -ContentType "application/json" -Body (@{
    visitorId  = $vid
    type       = "test"
    notes      = "formation-$i"
    occurredAt = $occurredAt
  } | ConvertTo-Json -Depth 10)

  if (-not $resp.id) { Fail "POST /api/formation/events did not return id" }
}

# 3) Page newest-first: limit=2, then next page using cursor
$page1 = Invoke-RestMethod -Method Get -Uri "$BaseUrl/api/visitors/$vid/formation/events?limit=2" -Headers $headers
if (-not $page1.items -or $page1.items.Count -ne 2) { Fail "Expected 2 items on page1" }
if (-not $page1.cursor) { Fail "Expected cursor on page1" }

# validate newest-first ordering: occurredAt descending
if ($page1.items[0].occurredAt -lt $page1.items[1].occurredAt) { Fail "Page1 not newest-first by occurredAt" }

$page2 = Invoke-RestMethod -Method Get -Uri "$BaseUrl/api/visitors/$vid/formation/events?limit=2&cursor=$([uri]::EscapeDataString($page1.cursor))" -Headers $headers
if (-not $page2.items -or $page2.items.Count -ne 2) { Fail "Expected 2 items on page2" }

# no overlap with page1 ids
$ids1 = @($page1.items | ForEach-Object { $_.id })
$ids2 = @($page2.items | ForEach-Object { $_.id })
if (@($ids1 | Where-Object { $ids2 -contains $_ }).Count -gt 0) { Fail "Paging overlap detected between page1 and page2" }

# 4) Collect 4 ids and ensure all unique
$all = @($ids1 + $ids2)
if (@($all | Select-Object -Unique).Count -ne $all.Count) { Fail "Duplicate ids across pages" }

"OK: formation pagination newest-first + cursor paging"