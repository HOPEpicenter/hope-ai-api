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

# Engagement status envelope (v1-ish): must include ok=true
Write-Host "Engagement status envelope ..."
$status = Invoke-RestMethod "$BaseUrl/engagements/status?visitorId=$visitorId" -Headers $Headers -Method Get
Assert-True ($status.ok -eq $true) "Expected engagements/status ok:true"
Write-Host "Engagement status envelope OK"
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
  type       = "note.add"
  occurredAt = NowIsoUtc ($start.AddMilliseconds(10))
  source     = @{ system = "smoke.ps1" }
  data       = @{ text = "hello"; seq = 1 }
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

$evt3 = @{
  v          = 1
  eventId    = New-Id "evt"
  visitorId  = $visitorId
  type       = "tag.add"
  occurredAt = NowIsoUtc ($start.AddMilliseconds(30))
  source     = @{ system = "smoke.ps1" }
  data       = @{ tag = "follow_up"; seq = 3 }
}

$evt4 = @{
  v          = 1
  eventId    = New-Id "evt"
  visitorId  = $visitorId
  type       = "tag.remove"
  occurredAt = NowIsoUtc ($start.AddMilliseconds(40))
  source     = @{ system = "smoke.ps1" }
  data       = @{ tag = "follow_up"; seq = 4 }
}

try {
  function Assert-EventEnvelope($resp, $label) {
    try {
      if (-not $resp -or ($resp.PSObject.Properties.Name -notcontains "ok") -or ($resp.ok -ne $true)) {
        $failures.Add("$label expected ok=true") | Out-Null
      }
    } catch { }
    try {
      if (-not $resp -or ($resp.PSObject.Properties.Name -notcontains "accepted") -or ($resp.accepted -ne $true)) {
        $failures.Add("$label expected accepted=true") | Out-Null
      }
    } catch { }
    try {
      if (-not $resp -or ($resp.PSObject.Properties.Name -notcontains "v") -or ([int]$resp.v -ne 1)) {
        $failures.Add("$label expected v=1") | Out-Null
      }
    } catch { }
  }

  $evtResp1 = Invoke-HttpJson -Method POST -Uri "$api/engagements/events" -Headers $headers -Body $evt1
  Write-Host ("Event#1 response: " + (Safe-Json $evtResp1 6))
  Assert-EventEnvelope $evtResp1 "event#1"

  $evtResp2 = Invoke-HttpJson -Method POST -Uri "$api/engagements/events" -Headers $headers -Body $evt2
  Write-Host ("Event#2 response: " + (Safe-Json $evtResp2 6))
  Assert-EventEnvelope $evtResp2 "event#2"

  $evtResp3 = Invoke-HttpJson -Method POST -Uri "$api/engagements/events" -Headers $headers -Body $evt3
  Write-Host ("Event#3 response: " + (Safe-Json $evtResp3 6))
  Assert-EventEnvelope $evtResp3 "event#3"

  $evtResp4 = Invoke-HttpJson -Method POST -Uri "$api/engagements/events" -Headers $headers -Body $evt4
  Write-Host ("Event#4 response: " + (Safe-Json $evtResp4 6))
  Assert-EventEnvelope $evtResp4 "event#4"

  Write-Host "Posted 4 events."
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

try {
  if (-not $timeline -or ($timeline.PSObject.Properties.Name -notcontains "ok") -or ($timeline.ok -ne $true)) {
    $failures.Add("timeline expected ok=true") | Out-Null
  }
} catch { }
try {
  if ($timeline -and ($timeline.PSObject.Properties.Name -contains "v")) {
    if ([int]$timeline.v -ne 1) { $failures.Add("timeline expected v=1") | Out-Null }
  } else {
    $failures.Add("timeline response missing 'v'") | Out-Null
  }
} catch { }

$timelineItems = Get-Items $timeline
if ($timelineItems.Count -lt 2) {
  $failures.Add(("timeline expected at least 2 items but got {0}" -f $timelineItems.Count)) | Out-Null
}

Write-Host ""
Write-Host "[4/4] GET /api/engagements/status?visitorId=..."

$status = $null
try {
  $status = Invoke-HttpJson -Method GET -Uri "$api/engagements/status?visitorId=$([uri]::EscapeDataString($visitorId))" -Headers $headers
  Write-Host ("Status response: " + (Safe-Json $status 12))
} catch {
  $failures.Add("status read failed: $($_.Exception.Message)") | Out-Null
}

try {
  if (-not $status -or ($status.PSObject.Properties.Name -notcontains "ok") -or ($status.ok -ne $true)) {
    $failures.Add("status expected ok=true") | Out-Null
  }
} catch { }

# v is optional here because status spreads the domain object; assert only if present
try {
  if ($status -and ($status.PSObject.Properties.Name -contains "v")) {
    if ([int]$status.v -ne 1) { $failures.Add("status expected v=1") | Out-Null }
  }
} catch { }

try {
  if ($status -and ($status.PSObject.Properties.Name -contains "visitorId")) {
    if ([string]$status.visitorId -ne $visitorId) { $failures.Add("status visitorId mismatch") | Out-Null }
  } else {
    $failures.Add("status response missing 'visitorId'") | Out-Null
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

