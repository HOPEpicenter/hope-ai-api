param(
  [Parameter(Mandatory=$false)]
  [string]$ApiBaseUrl = "http://127.0.0.1:3000/api",

  [Parameter(Mandatory=$false)]
  [string]$ApiKey = $env:HOPE_API_KEY
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

function Assert-True([bool]$cond, [string]$msg) {
  if (-not $cond) { throw "ASSERT FAIL: $msg" }
}

function Normalize-ApiBaseUrl([string]$u) {
  if ([string]::IsNullOrWhiteSpace($u)) { throw "ApiBaseUrl is required" }
  $u = $u.TrimEnd("/")
  if ($u -notmatch "/api$") { $u = "$u/api" }
  return $u
}

$api = Normalize-ApiBaseUrl $ApiBaseUrl

if ([string]::IsNullOrWhiteSpace($ApiKey)) {
  throw "HOPE_API_KEY is not set (or pass -ApiKey)."
}
$headers = @{ "x-api-key" = $ApiKey }

Write-Host "=== ASSERT: Integration timeline tie paging (occurredAt ties) ==="
Write-Host "ApiBaseUrl: $api"

# 0) health
$h = Invoke-WebRequest -UseBasicParsing -Method GET -Uri "$api/health"
Assert-True ($h.StatusCode -eq 200) "Expected 200 from GET $api/health"

# 1) Create visitor (public)
$email = ("tie-assert+" + [Guid]::NewGuid().ToString("N") + "@example.com")
$visitorBody = @{
  name   = "Tie Paging Assert"
  email  = $email
  source = "dev"
} | ConvertTo-Json -Depth 10

$v = Invoke-RestMethod -Method POST -Uri "$api/visitors" -ContentType "application/json" -Body $visitorBody
$vid = [string]$v.visitorId
Assert-True (-not [string]::IsNullOrWhiteSpace($vid)) "POST /visitors did not return visitorId"

# 2) Use exact same occurredAt for both events
$ts = (Get-Date).ToUniversalTime().ToString("o")
Write-Host "visitorId=$vid"
Write-Host "occurredAt=$ts"

# 3) Post engagement event (requires eventId format: evt-<32hex> or UUID)
$engEventId = "evt-$([Guid]::NewGuid().ToString('N'))"
$engBody = @{
  v          = 1
  eventId    = $engEventId
  visitorId  = $vid
  type       = "note.add"
  occurredAt = $ts
  source     = @{ system = "scripts/assert-integration-paging-ties.ps1" }
  data       = @{ text = "tie-break engagement" }
} | ConvertTo-Json -Depth 20

$engResp = Invoke-WebRequest -UseBasicParsing -Method POST -Uri "$api/engagements/events" -Headers $headers -ContentType "application/json" -Body $engBody
Assert-True ($engResp.StatusCode -ge 200 -and $engResp.StatusCode -lt 300) "POST /engagements/events expected 2xx, got $($engResp.StatusCode) Body=$($engResp.Content)"

# 4) Post formation event (requires v/eventId/source; FOLLOWUP_ASSIGNED needs metadata.assigneeId)
$formEventId = "evt-$([Guid]::NewGuid().ToString('N'))"
$formBody = @{
  v          = 1
  eventId    = $formEventId
  visitorId  = $vid
  type       = "FOLLOWUP_ASSIGNED"
  occurredAt = $ts
  source     = @{ system = "scripts/assert-integration-paging-ties.ps1" }
  metadata   = @{
    assigneeId = "tie-assert"
    channel    = "api"
    notes      = "tie-break formation"
  }
} | ConvertTo-Json -Depth 20

$formResp = Invoke-WebRequest -UseBasicParsing -Method POST -Uri "$api/formation/events" -Headers $headers -ContentType "application/json" -Body $formBody
Assert-True ($formResp.StatusCode -ge 200 -and $formResp.StatusCode -lt 300) "POST /formation/events expected 2xx, got $($formResp.StatusCode) Body=$($formResp.Content)"

# 5) Page 1 (limit=1) must return nextCursor (because 2 items exist)
$r1 = Invoke-RestMethod -Method GET -Uri "$api/integration/timeline?visitorId=$vid&limit=1" -Headers $headers
Assert-True ($r1.ok -eq $true) "Page1 expected ok=true"

$items1 = @($r1.items)  # force array even if API returns single object
Assert-True ($items1.Count -eq 1) "Page1 expected 1 item, got $($items1.Count)"

$cursor = [string]$r1.nextCursor
Assert-True (-not [string]::IsNullOrWhiteSpace($cursor)) "Page1 expected nextCursor with limit=1 when 2 items exist"

# 6) Page 2 using cursor: must return at least 1 item and must not overlap
$cursorEsc = [uri]::EscapeDataString($cursor)
$r2 = Invoke-RestMethod -Method GET -Uri "$api/integration/timeline?visitorId=$vid&limit=10&cursor=$cursorEsc" -Headers $headers
Assert-True ($r2.ok -eq $true) "Page2 expected ok=true"

$items2 = @($r2.items)  # force array
Assert-True ($items2.Count -ge 1) "Page2 expected >=1 item"

$ids1 = @($items1 | ForEach-Object { [string]$_.eventId })
$ids2 = @($items2 | ForEach-Object { [string]$_.eventId })

$overlap = @($ids1 | Where-Object { $ids2 -contains $_ })  # force array (0/1/many)
Assert-True ($overlap.Count -eq 0) "Overlap detected across pages: $($overlap -join ', ')"

Write-Host "OK: tie paging asserts passed."
Write-Host ("page1: {0}" -f ($ids1 -join ", "))
Write-Host ("page2: {0}" -f ($ids2 -join ", "))

