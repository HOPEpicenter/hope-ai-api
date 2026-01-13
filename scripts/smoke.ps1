param(
  [string]$BaseUrl = "http://localhost:7071/api",
  [string]$ApiKey  = $env:HOPE_API_KEY,
  [int]$Limit = 10
)

# =========================
# Helpers
# =========================
Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

function NowStamp {
  (Get-Date).ToUniversalTime().ToString("yyyyMMddTHHmmss.fffZ")
}

function WriteOk($msg)   { Write-Host ("[OK]   {0}" -f $msg) }
function WriteWarn($msg) { Write-Host ("[WARN] {0}" -f $msg) }
function WriteFail($msg) { Write-Host ("[FAIL] {0}" -f $msg) }

function EnsureApiKey {
  if (-not $ApiKey) { throw "HOPE_API_KEY missing. Set `$env:HOPE_API_KEY or pass -ApiKey." }
}

function Headers {
  EnsureApiKey
  @{ "x-api-key" = $ApiKey }
}

function CountEvents($obj) {
  if ($null -ne $obj -and $null -ne $obj.count) { return [int]$obj.count }
  if ($null -ne $obj -and $null -ne $obj.events) { return @($obj.events).Count }
  return 0
}

function SafeStr($v) {
  if ($null -eq $v) { return "" }
  [string]$v
}

function InvokeJson {
  param(
    [Parameter(Mandatory=$true)][ValidateSet("GET","POST","PUT","PATCH","DELETE")][string]$Method,
    [Parameter(Mandatory=$true)][string]$Url,
    [Parameter(Mandatory=$false)]$BodyObj
  )

  $hdrs = Headers

  if ($null -eq $BodyObj) {
    return Invoke-RestMethod -Method $Method -Uri $Url -Headers $hdrs
  }

  $json = $BodyObj | ConvertTo-Json -Depth 20
  return Invoke-RestMethod -Method $Method -Uri $Url -Headers $hdrs -ContentType "application/json" -Body $json
}

function Test-ApiReachable {
  param([string]$Url)

  try {
    # cheap ping: GET /engagements?limit=1
    $null = InvokeJson -Method GET -Url ($Url.TrimEnd("/") + "/engagements?limit=1")
    return $true
  } catch {
    return $false
  }
}

function Normalize-BaseUrl {
  param([string]$Url)

  $u = $Url.TrimEnd("/")
  if ($u.EndsWith("/api")) { return $u }
  return ($u + "/api")
}

# =========================
# Run setup
# =========================
$rand = (New-Object System.Random).Next(100000000, 999999999)
$runId = (NowStamp) + "_" + $rand

# Best-effort UTF-8 output in Windows PowerShell
try {
  [Console]::OutputEncoding = [System.Text.Encoding]::UTF8
  $OutputEncoding = [System.Text.Encoding]::UTF8
} catch { }

$BaseUrl = Normalize-BaseUrl $BaseUrl

Write-Host ("=== HOPE AI SMOKE ({0}) ===" -f $runId)
Write-Host ("BaseUrl: {0}" -f $BaseUrl)
Write-Host ""

# =========================
# Auto-fallback: localhost -> 127.0.0.1 (Windows Powershell sometimes flaky)
# =========================
try {
  EnsureApiKey
  if (-not (Test-ApiReachable $BaseUrl)) {
    if ($BaseUrl -match "http://localhost:") {
      $fallback = $BaseUrl -replace "http://localhost:", "http://127.0.0.1:"
      WriteWarn ("BaseUrl not reachable, trying fallback: {0}" -f $fallback)
      if (Test-ApiReachable $fallback) {
        $BaseUrl = $fallback
        WriteOk ("Using fallback BaseUrl: {0}" -f $BaseUrl)
      } else {
        throw "API not reachable at '$BaseUrl' or '$fallback'. Is func host running on port 7071?"
      }
    } else {
      throw "API not reachable at '$BaseUrl'. Is func host running on port 7071?"
    }
  }
} catch {
  WriteFail $_.Exception.Message
  exit 2
}

# =========================
# [1] POST /visitors
# =========================
try {
  Write-Host "[1] POST /visitors"
  $visitorEmail = "devsmoke+$((Get-Date).ToString('yyyyMMddHHmmss'))@example.com"
  $visitorBody = @{
    name   = "Dev Smoke"
    email  = $visitorEmail
    source = "dev"
  }
  $v = InvokeJson -Method POST -Url ($BaseUrl + "/visitors") -BodyObj $visitorBody
  $visitorId = $v.visitorId

  if (-not $visitorId) { throw "createVisitor did not return visitorId." }
  WriteOk ("visitorId = {0} (alreadyExists={1})" -f $visitorId, (SafeStr $v.alreadyExists))
  Write-Host ""
} catch {
  WriteFail ("POST /visitors failed: {0}" -f $_.Exception.Message)
  exit 10
}

# =========================
# [2] POST /engagements
# =========================
try {
  Write-Host "[2] POST /engagements"
  $engBody = @{
    visitorId = $visitorId
    eventType = "dev_engaged"
    channel   = "api"
    notes     = "Smoke engagement ($runId)"
  }
  $e = InvokeJson -Method POST -Url ($BaseUrl + "/engagements") -BodyObj $engBody

  if (-not $e.engagementId) { throw "createEngagement did not return engagementId." }
  WriteOk ("engagementId = {0}" -f $e.engagementId)
  Write-Host ""
} catch {
  WriteFail ("POST /engagements failed: {0}" -f $_.Exception.Message)
  exit 20
}

# =========================
# [3] GET /engagements?limit=...&debug=1
# =========================
try {
  Write-Host ("[3] GET /engagements?limit={0}&debug=1" -f $Limit)
  $g = InvokeJson -Method GET -Url ($BaseUrl + "/engagements?limit=$Limit&debug=1")
  $gCount = CountEvents $g
  WriteOk ("engagements returned: {0}" -f $gCount)
  Write-Host ""
} catch {
  WriteFail ("GET /engagements failed: {0}" -f $_.Exception.Message)
  exit 30
}

# =========================
# [4] Pagination smoke for engagements
# =========================
try {
  Write-Host "[4] GET /engagements?visitorId=...&limit=1&debug=1 (pagination smoke)"

  # Make sure we have multiple rows
  InvokeJson -Method POST -Url ($BaseUrl + "/engagements") -BodyObj @{
    visitorId = $visitorId; eventType="dev_engaged"; channel="api"; notes="pagination test 1"
  } | Out-Null

  Start-Sleep -Milliseconds 150

  InvokeJson -Method POST -Url ($BaseUrl + "/engagements") -BodyObj @{
    visitorId = $visitorId; eventType="dev_engaged"; channel="api"; notes="pagination test 2"
  } | Out-Null

  $p1 = InvokeJson -Method GET -Url ($BaseUrl + "/engagements?visitorId=$visitorId&limit=1&debug=1")
  $p1count = CountEvents $p1
  $cursor = $p1.nextCursor

  WriteOk ("first page count: {0}, nextCursor: {1}" -f $p1count, (SafeStr $cursor))

  if ($cursor) {
    $p2 = InvokeJson -Method GET -Url ($BaseUrl + "/engagements?visitorId=$visitorId&limit=10&cursor=$cursor&debug=1")
    $p2count = CountEvents $p2
    WriteOk ("second page count: {0}, nextCursor: {1}" -f $p2count, (SafeStr $p2.nextCursor))
  } else {
    WriteWarn "No nextCursor returned (may not have enough rows yet, or cursor logic disabled)."
  }

  Write-Host ""
} catch {
  WriteFail ("Engagement pagination smoke failed: {0}" -f $_.Exception.Message)
  exit 40
}

# =========================
# [5] POST /formation/events (FOLLOWUP_ASSIGNED)
# =========================
try {
  Write-Host "[5] POST /formation/events (FOLLOWUP_ASSIGNED with required metadata.assigneeId)"
  $fBody = @{
    visitorId  = $visitorId
    type       = "FOLLOWUP_ASSIGNED"
    occurredAt = (Get-Date).ToUniversalTime().ToString("o")
    metadata   = @{
      assigneeId = "ph6-smoke"
      channel    = "api"
      notes      = "Smoke formation ($runId)"
    }
  }
  $null = InvokeJson -Method POST -Url ($BaseUrl + "/formation/events") -BodyObj $fBody
  WriteOk "formation event posted"
  Write-Host ""
} catch {
  WriteFail ("POST /formation/events failed: {0}" -f $_.Exception.Message)
  exit 50
}

# =========================
# [6] GET /ops/visitors/{id}/dashboard
# =========================
try {
  Write-Host "[6] GET /ops/visitors/{id}/dashboard?timelineLimit=5&debug=1"
  $d = InvokeJson -Method GET -Url ($BaseUrl + "/ops/visitors/$visitorId/dashboard?timelineLimit=5&debug=1")
  $tpCount = 0
  if ($null -ne $d.timelinePreview -and $null -ne $d.timelinePreview.count) {
    $tpCount = [int]$d.timelinePreview.count
  }
  WriteOk ("dashboard ok. timelinePreview.count={0}" -f $tpCount)
  Write-Host ""
} catch {
  WriteFail ("GET /ops/visitors/{id}/dashboard failed: {0}" -f $_.Exception.Message)
  exit 60
}

# =========================
# [7] GET /ops/visitors/{id}/timeline
# =========================
try {
  Write-Host "[7] GET /ops/visitors/{id}/timeline?limit=10&kinds=formation,engagement&debug=1"
  $t = InvokeJson -Method GET -Url ($BaseUrl + "/ops/visitors/$visitorId/timeline?limit=10&kinds=formation,engagement&debug=1")
  $tCount = 0
  if ($null -ne $t.items) { $tCount = @($t.items).Count }
  WriteOk ("timeline ok. returned={0} nextCursor={1}" -f $tCount, (SafeStr $t.nextCursor))
  Write-Host ""
} catch {
  WriteFail ("GET /ops/visitors/{id}/timeline failed: {0}" -f $_.Exception.Message)
  exit 70
}

WriteOk "SMOKE TEST COMPLETE"
Write-Host ("VisitorId used: {0}" -f $visitorId)
exit 0
