# scripts/stress-engagement-events-paging.ps1
[CmdletBinding()]
param(
  [string]$BaseUrl = $(if ($env:HOPE_BASE_URL) { $env:HOPE_BASE_URL } else { "http://localhost:3000" }),
  [string]$VisitorId = $null,
  [int]$Total = 260,
  [int]$Limit = 200,
  [int]$PostDelayMs = 0,

  # Event generation mode:
  #  - note   : type="note" (default)
  #  - status : type="status.transition" with required data.from/data.to
  [ValidateSet("note","status")]
  [string]$Mode = "note"
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

function Require-Env([string]$name) {
  $v = [Environment]::GetEnvironmentVariable($name)
  if ([string]::IsNullOrWhiteSpace($v)) { throw "Missing required env var: $name" }
  return $v
}

function Safe-Json([object]$o, [int]$depth = 20) {
  try { return ($o | ConvertTo-Json -Depth $depth -Compress) } catch { return "<json_failed>" }
}

function Invoke-HttpJson {
  param(
    [Parameter(Mandatory=$true)][ValidateSet("GET","POST")][string]$Method,
    [Parameter(Mandatory=$true)][string]$Uri,
    [Parameter(Mandatory=$true)][hashtable]$Headers,
    [object]$Body = $null
  )

  $json = $null
  if ($null -ne $Body) { $json = ($Body | ConvertTo-Json -Depth 20) }

  try {
    if ($Method -eq "GET") {
      return Invoke-RestMethod -Method Get -Uri $Uri -Headers $Headers
    } else {
      return Invoke-RestMethod -Method Post -Uri $Uri -Headers $Headers -ContentType "application/json" -Body $json
    }
  }
  catch {
    $msg = $_.Exception.Message
    throw "HTTP $Method $Uri failed: $msg`nBody=$json"
  }
}

function New-Id([string]$prefix) {
  return ($prefix + "-" + [Guid]::NewGuid().ToString("N"))
}

function NowIsoUtc([datetime]$dt) {
  return $dt.ToUniversalTime().ToString("o")
}

function Get-ItemKey([object]$it) {
  try {
    $props = $it.PSObject.Properties.Name
    if ($props -contains "eventId" -and -not [string]::IsNullOrWhiteSpace([string]$it.eventId)) { return [string]$it.eventId }
    if ($props -contains "id"      -and -not [string]::IsNullOrWhiteSpace([string]$it.id))      { return [string]$it.id }
    if ($props -contains "rowKey"  -and -not [string]::IsNullOrWhiteSpace([string]$it.rowKey))  { return [string]$it.rowKey }
    if ($props -contains "RowKey"  -and -not [string]::IsNullOrWhiteSpace([string]$it.RowKey))  { return [string]$it.RowKey }
  } catch { }
  return (Safe-Json $it 8)
}

$apiKey = Require-Env "HOPE_API_KEY"

# Fail fast on obvious placeholders
if ($apiKey -match '^\s*<.*>\s*$') {
  throw "HOPE_API_KEY looks like a placeholder (e.g. <your-api-key>). Set a real key value and rerun."
}
if ($apiKey -match 'your-api-key' -or $apiKey -match 'changeme' -or $apiKey -match 'replace') {
  throw "HOPE_API_KEY looks like a placeholder. Set a real key value and rerun."
}

$headers = @{ "x-api-key" = $apiKey }

$BaseUrl = $BaseUrl.TrimEnd("/")
$api = "$BaseUrl/api"

if ([string]::IsNullOrWhiteSpace($VisitorId)) {
  $VisitorId = ("v-" + [Guid]::NewGuid().ToString("N"))
}
if ($VisitorId.Trim().Length -lt 8) { throw "VisitorId must be >= 8 chars." }

Write-Host "== stress-engagement-events-paging =="
Write-Host ("BaseUrl : {0}" -f $BaseUrl)
Write-Host ("API     : {0}" -f $api)
Write-Host ("Visitor : {0}" -f $VisitorId)
Write-Host ("Seed    : {0} events" -f $Total)
Write-Host ("Limit   : {0}" -f $Limit)
Write-Host ("Mode    : {0}" -f $Mode)
Write-Host ""

try {
  $h = Invoke-HttpJson -Method GET -Uri "$api/health" -Headers $headers
  Write-Host ("Health  : " + (Safe-Json $h 6))
} catch {
  Write-Host ("WARN: health check failed: " + $_.Exception.Message) -ForegroundColor Yellow
}
Write-Host ""

Write-Host ("[1/2] Posting {0} events to POST /api/engagements/events ..." -f $Total)

$start = (Get-Date).ToUniversalTime().AddMinutes(-5)

for ($i = 0; $i -lt $Total; $i++) {
  $eventId = New-Id "evt"
  $occurredAt = NowIsoUtc ($start.AddMilliseconds($i * 15))

  $type = if ($Mode -eq "status") { "status.transition" } else { "note" }

  $body = @{
    v          = 1
    eventId    = $eventId
    visitorId  = $VisitorId
    type       = $type
    occurredAt = $occurredAt
    source     = @{ system = "stress.ps1" }
    data       = @{ seq = $i; note = "stress seed" }
  }

  if ($Mode -eq "status") {
    $from = if ($i % 2 -eq 0) { "open" } else { "in_progress" }
    $to   = if ($i % 2 -eq 0) { "in_progress" } else { "open" }
    $body.data.from = $from
    $body.data.to   = $to
  }

  Invoke-HttpJson -Method POST -Uri "$api/engagements/events" -Headers $headers -Body $body | Out-Null

  if (($i + 1) % 25 -eq 0 -or ($i + 1) -eq $Total) {
    Write-Host ("  Posted {0}/{1}" -f ($i + 1), $Total)
  }

  if ($PostDelayMs -gt 0) { Start-Sleep -Milliseconds $PostDelayMs }
}

Write-Host "Posting complete."
Write-Host ""

Write-Host ("[2/2] Paging GET /api/engagements/timeline?visitorId=...&limit={0} ..." -f $Limit)

$allKeys   = New-Object System.Collections.Generic.HashSet[string]
$pageSizes = New-Object System.Collections.Generic.List[int]
$cursor    = $null
$page      = 0

while ($true) {
  $page++
  $uri = "$api/engagements/timeline?visitorId=$([uri]::EscapeDataString($VisitorId))&limit=$Limit"
  if (-not [string]::IsNullOrWhiteSpace([string]$cursor)) {
    $uri += "&cursor=$([uri]::EscapeDataString([string]$cursor))"
  }

  $resp = Invoke-HttpJson -Method GET -Uri $uri -Headers $headers

  $items = @()
  if ($resp -is [System.Collections.IEnumerable] -and $resp -isnot [string]) {
    try { if ($resp.PSObject.Properties.Name -contains "items") { $items = @($resp.items) } else { $items = @($resp) } }
    catch { $items = @($resp) }
  } else {
    try { if ($resp.PSObject.Properties.Name -contains "items") { $items = @($resp.items) } else { $items = @() } }
    catch { $items = @() }
  }

  $pageCount = $items.Count
  $pageSizes.Add($pageCount) | Out-Null

  $next = $null
  try { if ($resp.PSObject.Properties.Name -contains "nextCursor") { $next = $resp.nextCursor } } catch { }

  $dupes = 0
  foreach ($it in $items) {
    $k = Get-ItemKey $it
    if (-not $allKeys.Add($k)) { $dupes++ }
  }

  Write-Host ("  Page {0}: count={1}, dupesOnThisPage={2}, nextCursor={3}" -f $page, $pageCount, $dupes, $(if ([string]::IsNullOrWhiteSpace([string]$next)) { "<null>" } else { "<present>" }))

  $cursor = $next
  if ([string]::IsNullOrWhiteSpace([string]$cursor)) { break }
}

$totalGot = $allKeys.Count
$page1    = if ($pageSizes.Count -ge 1) { $pageSizes[0] } else { 0 }
$page2    = if ($pageSizes.Count -ge 2) { $pageSizes[1] } else { 0 }

$page1HasNext     = ($pageSizes.Count -gt 1)
$lastCursorIsNull = [string]::IsNullOrWhiteSpace([string]$cursor)

Write-Host ""
Write-Host "== Assertions =="

$failures = New-Object System.Collections.Generic.List[string]

if ($totalGot -ne $Total) { $failures.Add(("total items expected {0} but got {1}" -f $Total, $totalGot)) | Out-Null }
if ($page1 -ne $Limit) { $failures.Add(("page1 expected {0} but got {1}" -f $Limit, $page1)) | Out-Null }
if ($page2 -ne ($Total - $Limit)) { $failures.Add(("page2 expected {0} but got {1}" -f ($Total - $Limit), $page2)) | Out-Null }
if (-not $page1HasNext) { $failures.Add("expected nextCursor present on page1 (needed to reach page2)") | Out-Null }
if (-not $lastCursorIsNull) { $failures.Add("expected nextCursor null/empty on last page") | Out-Null }

if ($failures.Count -eq 0) {
  Write-Host ("PASS ✅  total={0}  page1={1}  page2={2}  pages={3}" -f $totalGot, $page1, $page2, $pageSizes.Count) -ForegroundColor Green
  exit 0
}

Write-Host "FAIL ❌" -ForegroundColor Red
$failures | ForEach-Object { Write-Host (" - " + $_) -ForegroundColor Red }
Write-Host ("Observed: total={0} page1={1} page2={2} pages={3}" -f $totalGot, $page1, $page2, $pageSizes.Count)
exit 1
