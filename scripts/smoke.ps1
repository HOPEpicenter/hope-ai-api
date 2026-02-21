param(
  [string]$BaseUrl = "http://127.0.0.1:3000/api",
  [string]$ApiKey  = $env:HOPE_API_KEY,
  [int]$Limit = 10
)

# ---------- helpers ----------
function NowStamp() {
  return (Get-Date).ToUniversalTime().ToString("yyyyMMddTHHmmss.fffZ")
}

# NOTE: Windows PowerShell doesn't like $(NowStamp()) in some contexts; keep it simple.
$rand = (New-Object System.Random).Next(100000000,999999999)
$runId = "$(NowStamp)_$rand"

# Make output UTF-8 (best effort in Windows PowerShell)
try {
  [Console]::OutputEncoding = [System.Text.Encoding]::UTF8
  $OutputEncoding = [System.Text.Encoding]::UTF8
} catch {}

function Hdrs() {
  if (-not $ApiKey) { throw "HOPE_API_KEY missing. Set `$env:HOPE_API_KEY first." }
  return @{ "x-api-key" = $ApiKey }
}

function InvokeJson($Method, $Url, $BodyObj = $null) {
  $headers = Hdrs
  if ($null -eq $BodyObj) {
    return Invoke-RestMethod -Method $Method -Uri $Url -Headers $headers
  } else {
    $json = $BodyObj | ConvertTo-Json -Depth 20
    return Invoke-RestMethod -Method $Method -Uri $Url -Headers $headers -ContentType "application/json" -Body $json
  }
}

function CountEvents($obj) {
  if ($null -ne $obj.count) { return [int]$obj.count }
  if ($null -ne $obj.events) { return @($obj.events).Count }
  return 0
}

function SafeStr($s) {
  if ($null -eq $s) { return "" }
  return [string]$s
}

function Ok($msg) { Write-Host ("[OK]   {0}" -f $msg) }
function Warn($msg) { Write-Host ("[WARN] {0}" -f $msg) }
function Fail($msg) { throw ("[FAIL] {0}" -f $msg) }

function Assert($cond, $msg) {
  if (-not $cond) { Fail $msg }
}

Write-Host ("=== HOPE AI SMOKE ({0}) ===" -f $runId)
Write-Host ("BaseUrl: {0}" -f $BaseUrl)
Write-Host ""

# ---------- [1] POST /visitors ----------
Write-Host "[1] POST /visitors"
$visitorEmail = "devsmoke+$((Get-Date).ToString('yyyyMMddHHmmss'))@example.com"
$visitorBody = @{
  name   = "Dev Smoke"
  email  = $visitorEmail
  source = "dev"
}
$v = InvokeJson "POST" "$BaseUrl/visitors" $visitorBody
$visitorId = $v.visitorId
Assert ($visitorId -and $visitorId.Length -gt 10) "POST /visitors did not return a visitorId"
Ok ("visitorId = {0} (alreadyExists={1})" -f $visitorId, $v.alreadyExists)
Write-Host ""

# ---------- [2] POST /engagements ----------
Write-Host "[2] POST /engagements"
$engBody = @{
  visitorId = $visitorId

    v          = 1
    eventId    = ([Guid]::NewGuid().ToString())
    occurredAt = (Get-Date).ToUniversalTime().ToString("o")
    source     = @{ system = "scripts/smoke.ps1" }
    data       = @{ channel = "api"; notes = "Smoke engagement ()" }
  type = "dev_engaged"
  channel   = "api"
  notes     = "Smoke engagement ($runId)"
}
$e = InvokeJson "POST" "$BaseUrl/engagements" $engBody
Assert ($e.ok -eq $true) "POST /engagements did not return ok=true"
Assert ($e.engagementId) "POST /engagements did not return engagementId"
Ok ("engagementId = {0}" -f $e.engagementId)
Write-Host ""

# ---------- [3] GET /engagements?limit=...&debug=1 ----------
Write-Host "[3] GET /engagements?limit=$Limit&debug=1"
$g = InvokeJson "GET" "$BaseUrl/engagements?limit=$Limit&debug=1"
$gCount = CountEvents $g
Assert ($g.ok -eq $true) "GET /engagements did not return ok=true"
Assert ($gCount -ge 1) "GET /engagements returned 0 events (expected at least 1)"
Ok ("engagements returned: {0}" -f $gCount)
Write-Host ""

# ---------- [4] Pagination smoke (per visitor) ----------
Write-Host "[4] GET /engagements?visitorId=...&limit=1&debug=1 (pagination smoke)"
# Create 2 more engagement rows to make pagination visible
InvokeJson "POST" "$BaseUrl/engagements" (@{
  visitorId = $visitorId; type="dev_engaged"; channel="api"; notes="pagination test 1"
}) | Out-Null
Start-Sleep -Milliseconds 150
InvokeJson "POST" "$BaseUrl/engagements" (@{
  visitorId = $visitorId; type="dev_engaged"; channel="api"; notes="pagination test 2"
}) | Out-Null

$p1 = InvokeJson "GET" "$BaseUrl/engagements?visitorId=$visitorId&limit=1&debug=1"
$p1count = CountEvents $p1
$cursor = $p1.nextCursor

Assert ($p1.ok -eq $true) "GET /engagements (page1) did not return ok=true"
Assert ($p1count -eq 1) "GET /engagements (page1) expected count=1 but got $p1count"
Ok ("first page count: {0}, nextCursor: {1}" -f $p1count, (SafeStr $cursor))

if ($cursor) {
  $p2 = InvokeJson "GET" "$BaseUrl/engagements?visitorId=$visitorId&limit=10&cursor=$cursor&debug=1"
  $p2count = CountEvents $p2
  Assert ($p2.ok -eq $true) "GET /engagements (page2) did not return ok=true"
  Assert ($p2count -ge 2) "GET /engagements (page2) expected >=2 events but got $p2count"
  Ok ("second page count: {0}, nextCursor: {1}" -f $p2count, (SafeStr $p2.nextCursor))
} else {
  Warn "No nextCursor returned (may not have enough rows yet, or cursor logic disabled)."
}
Write-Host ""

# ---------- [5] POST /formation/events ----------
Write-Host "[5] POST /formation/events (FOLLOWUP_ASSIGNED with required metadata.assigneeId)"
$fBody = @{
  visitorId   = $visitorId
  type        = "FOLLOWUP_ASSIGNED"
  occurredAt  = (Get-Date).ToUniversalTime().ToString("o")
  metadata    = @{
    assigneeId = "ph6-smoke"
    channel    = "api"
    notes      = "timeline seed formation"
  }
}
$f = InvokeJson "POST" "$BaseUrl/formation/events" $fBody
Assert ($f.ok -eq $true) "POST /formation/events did not return ok=true"
Ok "formation event posted"
Write-Host ""

# ---------- [6] GET /ops/visitors/{id}/dashboard ----------
Write-Host "[6] GET /ops/visitors/{id}/dashboard?timelineLimit=5&debug=1"
$d = InvokeJson "GET" "$BaseUrl/ops/visitors/$visitorId/dashboard?timelineLimit=5&debug=1"
Assert ($d.ok -eq $true) "GET /ops/visitors/{id}/dashboard did not return ok=true"
$tpCount = 0
if ($null -ne $d.timelinePreview -and $null -ne $d.timelinePreview.count) { $tpCount = [int]$d.timelinePreview.count }
Assert ($tpCount -ge 2) "dashboard.timelinePreview.count expected >=2 but got $tpCount"
Ok ("dashboard ok. timelinePreview.count={0}" -f $tpCount)
Write-Host ""

# ---------- [7] GET /ops/visitors/{id}/timeline (mapping assertions) ----------
Write-Host "[7] GET /ops/visitors/{id}/timeline?limit=10&kinds=formation,engagement&debug=1"
$t = InvokeJson "GET" "$BaseUrl/ops/visitors/$visitorId/timeline?limit=10&kinds=formation,engagement&debug=1"
Assert ($t.ok -eq $true) "GET /ops/visitors/{id}/timeline did not return ok=true"

$items = @()
if ($null -ne $t.items) { $items = @($t.items) }
Assert ($items.Count -ge 2) "timeline expected >=2 items but got $($items.Count)"

# Find the newest formation + engagement items
$formation = $items | Where-Object { $_.kind -eq "formation" } | Select-Object -First 1
$engagement = $items | Where-Object { $_.kind -eq "engagement" } | Select-Object -First 1

Assert ($formation -ne $null) "timeline missing formation item"
Assert ($engagement -ne $null) "timeline missing engagement item"

# Formation display should be built and include assignee + channel
Assert ([string]::IsNullOrWhiteSpace($formation.display) -eq $false) "formation.display is null/blank"
Assert ($formation.type -eq "FOLLOWUP_ASSIGNED") "formation.type expected FOLLOWUP_ASSIGNED but got $($formation.type)"
Assert ($formation.display -match "FOLLOWUP_ASSIGNED") "formation.display missing FOLLOWUP_ASSIGNED"
Assert ($formation.display -match "ph6-smoke") "formation.display missing assigneeId (ph6-smoke)"
Assert ($formation.display -match "\(api\)") "formation.display missing channel (api)"

# Engagement display should be present (we set it via notes) OR at least not null
Assert ([string]::IsNullOrWhiteSpace($engagement.display) -eq $false) "engagement.display is null/blank"

Ok ("timeline ok. returned={0} nextCursor={1}" -f $items.Count, (SafeStr $t.nextCursor))
Ok ("formation.display = {0}" -f $formation.display)
Ok ("engagement.display = {0}" -f $engagement.display)
Write-Host ""

Ok "SMOKE TEST COMPLETE"
Write-Host ("VisitorId used: {0}" -f $visitorId)



