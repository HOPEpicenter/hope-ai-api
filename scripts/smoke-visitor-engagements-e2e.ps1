# scripts/smoke-visitor-engagements-e2e.ps1
[CmdletBinding()]
param(
  [string]$BaseUrl = $(if ($env:HOPE_BASE_URL) { $env:HOPE_BASE_URL } else { "http://localhost:3000" }),
  [int]$TimelineLimit = 10
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

function Get-Items([object]$resp) {
  if ($null -eq $resp) { return @() }

  if ($resp -is [System.Collections.IEnumerable] -and $resp -isnot [string]) {
    try {
      if ($resp.PSObject.Properties.Name -contains "items") { return @($resp.items) }
      return @($resp)
    } catch { return @($resp) }
  }

  try {
    if ($resp.PSObject.Properties.Name -contains "items") { return @($resp.items) }
  } catch { }

  return @()
}

$apiKey = Require-Env "HOPE_API_KEY"

if ($apiKey -match '^\s*<.*>\s*$' -or $apiKey -match 'your-api-key' -or $apiKey -match 'changeme' -or $apiKey -match 'replace') {
  throw "HOPE_API_KEY looks like a placeholder. Set a real key value and rerun."
}

$headers = @{ "x-api-key" = $apiKey }

$BaseUrl = $BaseUrl.TrimEnd("/")
$api = "$BaseUrl/api"

Write-Host "== smoke-visitor-engagements-e2e =="

try {
  $h = Invoke-HttpJson -Method GET -Uri "$api/health" -Headers $headers
  Write-Host ("Health  : " + (Safe-Json $h 6))
} catch {
  Write-Host ("WARN: health check failed: " + $_.Exception.Message) -ForegroundColor Yellow
}

$failures = New-Object System.Collections.Generic.List[string]

Write-Host ""
Write-Host "[1/4] POST /api/visitors"

$visitorBody = @{
  v = 1
  name  = "Smoke Test"
  email = ("smoke+" + [Guid]::NewGuid().ToString("N") + "@example.com")
}

$created = $null
try {
  $created = Invoke-HttpJson -Method POST -Uri "$api/visitors" -Headers $headers -Body $visitorBody
  Write-Host ("Create visitor response: " + (Safe-Json $created 10))
} catch {
  $failures.Add("create visitor failed: $($_.Exception.Message)") | Out-Null
}

$visitorId = $null
try {
  if ($created -and ($created.PSObject.Properties.Name -contains "visitorId")) { $visitorId = [string]$created.visitorId }
  elseif ($created -and ($created.PSObject.Properties.Name -contains "id")) { $visitorId = [string]$created.id }
} catch { }

if ([string]::IsNullOrWhiteSpace($visitorId) -or $visitorId.Length -lt 8) {
  $failures.Add("create visitor did not return a valid visitorId (>= 8 chars).") | Out-Null
}

if ($failures.Count -gt 0) {
  Write-Host ""
  Write-Host "FAIL ❌" -ForegroundColor Red
  $failures | ForEach-Object { Write-Host (" - " + $_) -ForegroundColor Red }
  exit 1
}

Write-Host ("VisitorId: {0}" -f $visitorId)

Write-Host ""
Write-Host "[2/4] POST /api/engagements/events (2 events)"

$start = (Get-Date).ToUniversalTime().AddSeconds(-10)

$evt1 = @{
  v          = 1
  eventId    = New-Id "evt"
  visitorId  = $visitorId
  type       = "note"
  occurredAt = NowIsoUtc ($start.AddMilliseconds(10))
  source     = @{ system = "smoke.ps1" }
  data       = @{ note = "hello"; seq = 1 }
}

$evt2 = @{
  v          = 1
  eventId    = New-Id "evt"
  visitorId  = $visitorId
  type       = "status.transition"
  occurredAt = NowIsoUtc ($start.AddMilliseconds(20))
  source     = @{ system = "smoke.ps1" }
  data       = @{
    seq  = 2
    from = "open"
    to   = "in_progress"
  }
}

try {
  Invoke-HttpJson -Method POST -Uri "$api/engagements/events" -Headers $headers -Body $evt1 | Out-Null
  Invoke-HttpJson -Method POST -Uri "$api/engagements/events" -Headers $headers -Body $evt2 | Out-Null
  Write-Host "Posted 2 events."
} catch {
  $failures.Add("posting events failed: $($_.Exception.Message)") | Out-Null
}

Write-Host ""
Write-Host ("[3/4] GET /api/engagements/timeline?visitorId=...&limit={0}" -f $TimelineLimit)

$timeline = $null
try {
  $timeline = Invoke-HttpJson -Method GET -Uri "$api/engagements/timeline?visitorId=$([uri]::EscapeDataString($visitorId))&limit=$TimelineLimit" -Headers $headers
  Write-Host ("Timeline response: " + (Safe-Json $timeline 12))
} catch {
  $failures.Add("timeline read failed: $($_.Exception.Message)") | Out-Null
}

$timelineItems = Get-Items $timeline
if ($timelineItems.Count -lt 2) {
  $failures.Add(("timeline expected at least 2 items but got {0}" -f $timelineItems.Count)) | Out-Null
}

Write-Host ""
Write-Host "[4/4] GET /api/engagements/analytics?visitorId=..."

$analytics = $null
try {
  $analytics = Invoke-HttpJson -Method GET -Uri "$api/engagements/analytics?visitorId=$([uri]::EscapeDataString($visitorId))" -Headers $headers
  Write-Host ("Analytics response: " + (Safe-Json $analytics 12))
} catch {
  $failures.Add("analytics read failed: $($_.Exception.Message)") | Out-Null
}

try {
  if ($analytics -and ($analytics.PSObject.Properties.Name -contains "v")) {
    if ([int]$analytics.v -ne 1) { $failures.Add("analytics expected v=1") | Out-Null }
  } else {
    $failures.Add("analytics response missing 'v'") | Out-Null
  }
} catch { }

try {
  if ($analytics -and ($analytics.PSObject.Properties.Name -contains "visitorId")) {
    if ([string]$analytics.visitorId -ne $visitorId) { $failures.Add("analytics visitorId mismatch") | Out-Null }
  } else {
    $failures.Add("analytics response missing 'visitorId'") | Out-Null
  }
} catch { }

Write-Host ""
if ($failures.Count -eq 0) {
  Write-Host ("PASS ✅  visitorId={0}  timelineItems={1}" -f $visitorId, $timelineItems.Count) -ForegroundColor Green
  exit 0
}

Write-Host "FAIL ❌" -ForegroundColor Red
$failures | ForEach-Object { Write-Host (" - " + $_) -ForegroundColor Red }
Write-Host ("Context: visitorId={0} timelineItems={1}" -f $visitorId, $timelineItems.Count)
exit 1
