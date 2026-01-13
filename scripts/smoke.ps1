param(
  [string]$BaseUrl = "http://127.0.0.1:7071/api",
  [string]$ApiKey  = $env:HOPE_API_KEY,
  [int]$Limit = 10
)

# ---------- helpers ----------
function NowStamp() {
  return (Get-Date).ToUniversalTime().ToString("yyyyMMddTHHmmss.fffZ")
}

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
Write-Host ("✅ visitorId = {0} (alreadyExists={1})" -f $visitorId, $v.alreadyExists)
Write-Host ""

# ---------- [2] POST /engagements ----------
Write-Host "[2] POST /engagements"
$engBody = @{
  visitorId = $visitorId
  eventType = "dev_engaged"
  channel   = "api"
  notes     = "Smoke engagement ($runId)"
}
$e = InvokeJson "POST" "$BaseUrl/engagements" $engBody
Write-Host ("✅ engagementId = {0}" -f $e.engagementId)
Write-Host ""

# ---------- [3] GET /engagements?limit=10&debug=1 ----------
Write-Host "[3] GET /engagements?limit=$Limit&debug=1"
$g = InvokeJson "GET" "$BaseUrl/engagements?limit=$Limit&debug=1"
$gCount = CountEvents $g
Write-Host ("✅ engagements returned: {0}" -f $gCount)
Write-Host ""

# ---------- [4] GET /engagements?visitorId=...&limit=1&debug=1 (pagination smoke) ----------
Write-Host "[4] GET /engagements?visitorId=...&limit=1&debug=1 (pagination smoke)"
# Create 2 more engagement rows to make pagination visible
InvokeJson "POST" "$BaseUrl/engagements" (@{
  visitorId = $visitorId; eventType="dev_engaged"; channel="api"; notes="pagination test 1"
}) | Out-Null
Start-Sleep -Milliseconds 150
InvokeJson "POST" "$BaseUrl/engagements" (@{
  visitorId = $visitorId; eventType="dev_engaged"; channel="api"; notes="pagination test 2"
}) | Out-Null

$p1 = InvokeJson "GET" "$BaseUrl/engagements?visitorId=$visitorId&limit=1&debug=1"
$p1count = CountEvents $p1
$cursor = $p1.nextCursor
Write-Host ("✅ first page count: {0}, nextCursor: {1}" -f $p1count, (SafeStr $cursor))

if ($cursor) {
  $p2 = InvokeJson "GET" "$BaseUrl/engagements?visitorId=$visitorId&limit=10&cursor=$cursor&debug=1"
  $p2count = CountEvents $p2
  Write-Host ("✅ second page count: {0}, nextCursor: {1}" -f $p2count, (SafeStr $p2.nextCursor))
} else {
  Write-Host "⚠️  No nextCursor returned (may not have enough rows yet, or cursor logic disabled)."
}
Write-Host ""

# ---------- [5] POST /formation/events (FOLLOWUP_ASSIGNED with required metadata.assigneeId) ----------
Write-Host "[5] POST /formation/events (FOLLOWUP_ASSIGNED with required metadata.assigneeId)"
$fBody = @{
  visitorId   = $visitorId
  type        = "FOLLOWUP_ASSIGNED"
  occurredAt  = (Get-Date).ToUniversalTime().ToString("o")
  metadata    = @{
    assigneeId = "ph6-smoke"
    channel    = "api"
    notes      = "Smoke formation ($runId)"
  }
}
$f = InvokeJson "POST" "$BaseUrl/formation/events" $fBody
Write-Host "✅ formation event posted"
Write-Host ""

# ---------- [6] GET /ops/visitors/{id}/dashboard?timelineLimit=5&debug=1 ----------
Write-Host "[6] GET /ops/visitors/{id}/dashboard?timelineLimit=5&debug=1"
$d = InvokeJson "GET" "$BaseUrl/ops/visitors/$visitorId/dashboard?timelineLimit=5&debug=1"
$tpCount = 0
if ($null -ne $d.timelinePreview -and $null -ne $d.timelinePreview.count) { $tpCount = [int]$d.timelinePreview.count }
Write-Host ("✅ dashboard ok. timelinePreview.count={0}" -f $tpCount)
Write-Host ""

# ---------- [7] GET /ops/visitors/{id}/timeline?limit=10&kinds=formation,engagement&debug=1 ----------
Write-Host "[7] GET /ops/visitors/{id}/timeline?limit=10&kinds=formation,engagement&debug=1"
$t = InvokeJson "GET" "$BaseUrl/ops/visitors/$visitorId/timeline?limit=10&kinds=formation,engagement&debug=1"
$tCount = 0
if ($null -ne $t.items) { $tCount = @($t.items).Count }
Write-Host ("✅ timeline ok. returned={0} nextCursor={1}" -f $tCount, (SafeStr $t.nextCursor))
Write-Host ""

Write-Host "✅ SMOKE TEST COMPLETE"
Write-Host ("VisitorId used: {0}" -f $visitorId)
