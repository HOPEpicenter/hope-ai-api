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


# [0/6] Score query validation (lock 400 shape)
Write-Host ""
Write-Host "[0/6] GET /api/engagements/score validation (400s)"

function Invoke-HttpJsonAllowFail {
  param(
    [Parameter(Mandatory=$true)][ValidateSet("GET","POST")][string]$Method,
    [Parameter(Mandatory=$true)][string]$Uri,
    [Parameter(Mandatory=$true)][hashtable]$Headers,
    [object]$Body = $null
  )

  $json = $null
  if ($null -ne $Body) { $json = ($Body | ConvertTo-Json -Depth 20) }

  try {
    try { Add-Type -AssemblyName System.Net.Http -ErrorAction Stop } catch { }
$Method = $Method.ToUpperInvariant()
$httpMethod = [System.Net.Http.HttpMethod]::new($Method)

    $client = [System.Net.Http.HttpClient]::new()
    try {
      $req = [System.Net.Http.HttpRequestMessage]::new($httpMethod, $Uri)
      try {
        foreach ($k in $Headers.Keys) {
          [void]$req.Headers.TryAddWithoutValidation([string]$k, [string]$Headers[$k])
        }

        if ($Method -eq "POST") {
          $req.Content = [System.Net.Http.StringContent]::new($json, [System.Text.Encoding]::UTF8, "application/json")
        }

        $resp = $client.SendAsync($req).GetAwaiter().GetResult()
        $status = [int]$resp.StatusCode
        $bodyText = $resp.Content.ReadAsStringAsync().GetAwaiter().GetResult()

        $bodyJson = $null
        if (-not [string]::IsNullOrWhiteSpace($bodyText)) {
          try { $bodyJson = $bodyText | ConvertFrom-Json } catch { }
        }

        return [pscustomobject]@{
          ok       = $false
          status   = $status
          bodyText = $bodyText
          body     = $bodyJson
        }
      } finally {
        if ($req) { $req.Dispose() }
      }
    } finally {
      if ($client) { $client.Dispose() }
    }
  } catch {
    return [pscustomobject]@{
      ok       = $false
      status   = $null
      bodyText = $null
      body     = $null
      error    = $_
    }
  }
}

function Assert-Validation400($resp, $label) {
  if ($resp -and ($resp.PSObject.Properties.Name -contains "error") -and $resp.error) {
    $failures.Add(("{0}: request failed: {1}" -f $label, $resp.error.Exception.Message)) | Out-Null
    return
  }
  if (-not $resp -or -not $resp.status) {
    $failures.Add(("{0}: missing status (request likely failed)" -f $label)) | Out-Null
    return
  }

  if ([int]$resp.status -ne 400) {
    $failures.Add(("{0}: expected HTTP 400, got {1}" -f $label, $resp.status)) | Out-Null
    return
  }

  $b = $resp.body
  if (-not $b) {
    $failures.Add(("{0}: missing JSON body (bodyText={1})" -f $label, $resp.bodyText)) | Out-Null
    return
  }

  try { if (($b.PSObject.Properties.Name -notcontains "ok") -or ($b.ok -ne $false)) { $failures.Add(("{0}: expected ok=false" -f $label)) | Out-Null } } catch { }
  try {
    if (($b.PSObject.Properties.Name -notcontains "error") -or -not $b.error) { $failures.Add(("{0}: expected error object" -f $label)) | Out-Null }
    elseif (($b.error.PSObject.Properties.Name -notcontains "code") -or ($b.error.code -ne "VALIDATION_ERROR")) { $failures.Add(("{0}: expected error.code=VALIDATION_ERROR" -f $label)) | Out-Null }
  } catch { }
}

$bad1 = Invoke-HttpJsonAllowFail -Method GET -Uri "$api/engagements/score?windowDays=14" -Headers $headers
Assert-Validation400 $bad1 "score missing visitorId"

$bad2 = Invoke-HttpJsonAllowFail -Method GET -Uri "$api/engagements/score?visitorId=fakevisitor123&windowDays=0" -Headers $headers
Assert-Validation400 $bad2 "score windowDays=0"

$bad3 = Invoke-HttpJsonAllowFail -Method GET -Uri "$api/engagements/score?visitorId=fakevisitor123&windowDays=366" -Headers $headers
Assert-Validation400 $bad3 "score windowDays=366"

Write-Host ""
Write-Host "[1/5] POST /api/visitors"

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
  Write-Host "FAIL" -ForegroundColor Red
  $failures | ForEach-Object { Write-Host (" - " + $_) -ForegroundColor Red }
  exit 1
}

Write-Host ("VisitorId: {0}" -f $visitorId)

Write-Host ""
Write-Host "[2a/5] POST /api/engagements/events strict validation (400s)"

function Assert-EventValidation400($resp, $label) {
  Assert-Validation400 $resp $label
}

# Build a known-good base envelope, then mutate it for negative tests
$goodBase = @{
  v          = 1
  eventId    = ("evt-" + [Guid]::NewGuid().ToString("N"))
  visitorId  = $visitorId
  type       = "note.add"
  occurredAt = NowIsoUtc ((Get-Date).ToUniversalTime())
  source     = @{ system = "smoke.ps1" }
  data       = @{ text = "hello" }
}

# (1) Missing source.system
$badEnv1 = @{} + $goodBase
$badEnv1.source = @{}   # system missing
$badResp1 = Invoke-HttpJsonAllowFail -Method POST -Uri "$api/engagements/events" -Headers $headers -Body $badEnv1
Assert-EventValidation400 $badResp1 "events missing source.system"

# (2) occurredAt missing timezone (strict should reject)
$badEnv2 = @{} + $goodBase
$badEnv2.occurredAt = "2026-02-21T20:00:00.000"  # no Z / offset
$badResp2 = Invoke-HttpJsonAllowFail -Method POST -Uri "$api/engagements/events" -Headers $headers -Body $badEnv2
Assert-EventValidation400 $badResp2 "events occurredAt missing timezone"

# (3) invalid eventId format
$badEnv3 = @{} + $goodBase
$badEnv3.eventId = "not-an-event-id"
$badResp3 = Invoke-HttpJsonAllowFail -Method POST -Uri "$api/engagements/events" -Headers $headers -Body $badEnv3
Assert-EventValidation400 $badResp3 "events invalid eventId format"

# (4) status.transition missing required field (to)
$badEnv4 = @{
  v          = 1
  eventId    = ("evt-" + [Guid]::NewGuid().ToString("N"))
  visitorId  = $visitorId
  type       = "status.transition"
  occurredAt = NowIsoUtc ((Get-Date).ToUniversalTime())
  source     = @{ system = "smoke.ps1" }
  data       = @{ from = "open" } # missing "to"
}
$badResp4 = Invoke-HttpJsonAllowFail -Method POST -Uri "$api/engagements/events" -Headers $headers -Body $badEnv4
Assert-EventValidation400 $badResp4 "events status.transition missing data.to"
Write-Host ""
Write-Host "[2/5] POST /api/engagements/events (4 events)"

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
Write-Host ("[3/5] GET /api/engagements/timeline?visitorId=...&limit={0}" -f $TimelineLimit)

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
Write-Host "[4/5] GET /api/engagements/score?visitorId=...&windowDays=14"

$score = $null
try {
  $score = Invoke-HttpJson -Method GET -Uri "$api/engagements/score?visitorId=$([uri]::EscapeDataString($visitorId))&windowDays=14" -Headers $headers
  Write-Host ("Score response: " + (Safe-Json $score 12))
} catch {
  $failures.Add("score read failed: $($_.Exception.Message)") | Out-Null
}

try {
  if (-not $score -or ($score.PSObject.Properties.Name -notcontains "ok") -or ($score.ok -ne $true)) {
    $failures.Add("score expected ok=true") | Out-Null
  }
} catch { }

try {
  if ($score -and ($score.PSObject.Properties.Name -contains "v")) {
    if ([int]$score.v -ne 1) { $failures.Add("score expected v=1") | Out-Null }
  } else {
    $failures.Add("score response missing 'v'") | Out-Null
  }
} catch { }

try {
  if ($score -and ($score.PSObject.Properties.Name -contains "visitorId")) {
    if ([string]$score.visitorId -ne $visitorId) { $failures.Add("score visitorId mismatch") | Out-Null }
  } else {
    $failures.Add("score response missing 'visitorId'") | Out-Null
  }
} catch { }

try {
  if ($score -and ($score.PSObject.Properties.Name -contains "windowDays")) {
    if ([int]$score.windowDays -ne 14) { $failures.Add("score expected windowDays=14") | Out-Null }
  } else {
    $failures.Add("score response missing 'windowDays'") | Out-Null
  }
} catch { }

Write-Host ""
Write-Host "[5/5] GET /api/engagements/status?visitorId=..."

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
# [6/6] Score for a brand-new visitor (no events) should be empty/needsFollowup
Write-Host ""
Write-Host "[6/6] GET /api/engagements/score (empty visitor => engaged=false)"

$emptyVisitorBody = @{
  v = 1
  name  = "Smoke Empty Score"
  email = ("smoke+empty+" + [Guid]::NewGuid().ToString("N") + "@example.com")
}

$emptyCreated = $null
$emptyVisitorId = $null
try {
  $emptyCreated = Invoke-HttpJson -Method POST -Uri "$api/visitors" -Headers $headers -Body $emptyVisitorBody
  try {
    if ($emptyCreated -and ($emptyCreated.PSObject.Properties.Name -contains "visitorId")) { $emptyVisitorId = [string]$emptyCreated.visitorId }
    elseif ($emptyCreated -and ($emptyCreated.PSObject.Properties.Name -contains "id")) { $emptyVisitorId = [string]$emptyCreated.id }
  } catch { }
} catch {
  $failures.Add(("empty visitor create failed: {0}" -f $_.Exception.Message)) | Out-Null
}

if ([string]::IsNullOrWhiteSpace($emptyVisitorId) -or $emptyVisitorId.Length -lt 8) {
  $failures.Add("empty visitor did not return a valid visitorId (>= 8 chars).") | Out-Null
} else {
  $emptyScore = $null
  try {
    $emptyScore = Invoke-HttpJson -Method GET -Uri "$api/engagements/score?visitorId=$([uri]::EscapeDataString($emptyVisitorId))&windowDays=14" -Headers $headers
    Write-Host ("Empty score response: " + (Safe-Json $emptyScore 12))
  } catch {
    $failures.Add(("empty score read failed: {0}" -f $_.Exception.Message)) | Out-Null
  }

  try { if ($emptyScore -and ($emptyScore.PSObject.Properties.Name -contains "engaged") -and ($emptyScore.engaged -ne $false)) { $failures.Add("empty score expected engaged=false") | Out-Null } } catch { }
  try { if ($emptyScore -and ($emptyScore.PSObject.Properties.Name -contains "engagementCount") -and ([int]$emptyScore.engagementCount -ne 0)) { $failures.Add("empty score expected engagementCount=0") | Out-Null } } catch { }
  try { if ($emptyScore -and ($emptyScore.PSObject.Properties.Name -contains "score") -and ([int]$emptyScore.score -ne 0)) { $failures.Add("empty score expected score=0") | Out-Null } } catch { }
  try { if ($emptyScore -and ($emptyScore.PSObject.Properties.Name -contains "needsFollowup") -and ($emptyScore.needsFollowup -ne $true)) { $failures.Add("empty score expected needsFollowup=true") | Out-Null } } catch { }
}

Write-Host ""
if ($failures.Count -eq 0) {
  Write-Host ("PASS OK  visitorId={0}  timelineItems={1}" -f $visitorId, $timelineItems.Count) -ForegroundColor Green
  exit 0
}

Write-Host "FAIL" -ForegroundColor Red
$failures | ForEach-Object { Write-Host (" - " + $_) -ForegroundColor Red }
Write-Host ("Context: visitorId={0} timelineItems={1}" -f $visitorId, $timelineItems.Count)
exit 1

