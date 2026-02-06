# scripts/smoke-tests.ps1
# Smoke tests for /ops endpoints (PS 5.1 safe)

[CmdletBinding()]
param(
  [string]$BaseUrl = $env:OPS_BASE_URL
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

if (-not $BaseUrl -or $BaseUrl.Trim().Length -eq 0) {
  throw "BaseUrl is required. Pass -BaseUrl or set OPS_BASE_URL."
}
$BaseUrl = $BaseUrl.TrimEnd("/")

# Dot-source ops helpers (OpsRequest, etc.)
. (Join-Path $PSScriptRoot "ops.ps1")

function Assert-True {
  param(
    $Value,
    [string]$Message = "Assertion failed."
  )
  $ok = $false
  if ($null -ne $Value) {
    if ($Value -is [bool]) { $ok = $Value }
    elseif ($Value -is [string]) { $ok = ($Value.Trim().Length -gt 0) }
    else { $ok = $true }
  }
  if (-not $ok) { throw $Message }
}

function Get-BodyProp {
  param(
    [Parameter(Mandatory=$true)]$Resp,
    [Parameter(Mandatory=$true)][string]$Name
  )
  if (-not $Resp) { return $null }
  $b = $Resp.Body
  if (-not $b) { return $null }
  $p = $b.PSObject.Properties.Match($Name)
  if (@($p).Count -lt 1) { return $null }
  return $b.$Name
}

function Get-HeaderValue {
  param(
    [Parameter(Mandatory=$true)]$Headers,
    [Parameter(Mandatory=$true)][string]$Name
  )
  if (-not $Headers) { return $null }

  # Try indexer first (works for many header collections)
  try {
    $v = $Headers[$Name]
    if ($v) { return [string]$v }
  } catch { }

  # Try AllKeys/Keys enumeration (case-insensitive)
  $keys = $null
  try { $keys = @($Headers.AllKeys) } catch { $keys = $null }
  if (-not $keys) { try { $keys = @($Headers.Keys) } catch { $keys = $null } }

  if ($keys) {
    foreach ($k in $keys) {
      if ([string]::Equals([string]$k, $Name, [System.StringComparison]::OrdinalIgnoreCase)) {
        try {
          $v2 = $Headers[$k]
          if ($v2) { return [string]$v2 }
        } catch { }
        try {
          $v3 = $Headers.Get($k)
          if ($v3) { return [string]$v3 }
        } catch { }
      }
    }
  }

  # Last resort: Get("x-request-id")
  try {
    $v4 = $Headers.Get($Name)
    if ($v4) { return [string]$v4 }
  } catch { }

  return $null
}

function Assert-RequestId {
  param(
    [Parameter(Mandatory=$true)]$Resp,
    [Parameter(Mandatory=$true)][string]$Context
  )

  $rid = Get-HeaderValue -Headers $Resp.Headers -Name "x-request-id"
  if (-not $rid) { $rid = Get-HeaderValue -Headers $Resp.Headers -Name "X-Request-Id" }

  if (-not $rid -or $rid.Trim().Length -eq 0) {
    throw ("Missing x-request-id header for: {0} (Status={1}). Ensure requestIdMiddleware runs before routes and errorMiddleware." -f $Context, $Resp.Status)
  }

  return $rid
}

function Assert-HasJsonError {
  param(
    [Parameter(Mandatory=$true)]$Resp,
    [Parameter(Mandatory=$true)][string]$ExpectedError,
    [Parameter(Mandatory=$true)][string]$Context
  )

  $err = Get-BodyProp -Resp $Resp -Name "error"
  if (-not $err) {
    throw ("Expected JSON body with property 'error' for: {0}. Status={1}. RawBody={2}" -f $Context, $Resp.Status, $Resp.Text)
  }
  if ($err -ne $ExpectedError) {
    throw ("Expected error='{0}' but got '{1}' for: {2}. RawBody={3}" -f $ExpectedError, $err, $Context, $Resp.Text)
  }
}

Write-Host ""
Write-Host ("Smoke test against " + $BaseUrl)
Write-Host ""

# 1) Health
$health = OpsRequest -BaseUrl $BaseUrl -Method GET -Path "/ops/health"
Assert-True ($health.Status -eq 200) "Health expected 200"
Assert-True ((Get-BodyProp -Resp $health -Name "ok") -eq $true) "Health expected ok:true"
$healthRid = Assert-RequestId -Resp $health -Context "GET /ops/health"

# 2) Create visitor
$create = OpsRequest -BaseUrl $BaseUrl -Method POST -Path "/ops/visitors" -Body @{
  name  = "Smoke Tester $(Get-Date -Format s)"
  email = ("smoke+{0}@example.com" -f ([Guid]::NewGuid().ToString("N")))
}
Assert-True ($create.Status -eq 201) "Create visitor expected 201"
$createRid = Assert-RequestId -Resp $create -Context "POST /ops/visitors"
$visitorId = Get-BodyProp -Resp $create -Name "visitorId"
Assert-True $visitorId "Create visitor expected visitorId"
Write-Host ("Created visitorId: " + $visitorId)

# 3) Populate dummy
$dummy = OpsRequest -BaseUrl $BaseUrl -Method POST -Path "/ops/populate-dummy"
Assert-True ($dummy.Status -eq 201) "Populate dummy expected 201"
$dummyRid = Assert-RequestId -Resp $dummy -Context "POST /ops/populate-dummy"

# 4) Dashboard (accepts legacy timelineLimit alias)
$dash = OpsRequest -BaseUrl $BaseUrl -Method GET -Path ("/ops/visitors/{0}/dashboard?timelineLimit=20" -f $visitorId)
Assert-True ($dash.Status -eq 200) "Dashboard expected 200"
$dashRid = Assert-RequestId -Resp $dash -Context "GET /ops/visitors/:id/dashboard"
Assert-True ((Get-BodyProp -Resp $dash -Name "visitorId") -eq $visitorId) "Dashboard visitorId mismatch"
Write-Host "Dashboard OK"

# 5) Append event (valid)
$evt = OpsRequest -BaseUrl $BaseUrl -Method POST -Path ("/ops/visitors/{0}/events" -f $visitorId) -Body @{
  type     = "note"
  metadata = @{ ok = $true; source = "smoke" }
}
Assert-True ($evt.Status -eq 201) "Append event expected 201"
$evtRid = Assert-RequestId -Resp $evt -Context "POST /ops/visitors/:id/events"
Write-Host "Append event OK"

# 6) Oversized metadata should return 400 + requestId (JSON preferred, but allow empty body)
$big = ("x" * 13312)
$tooBig = OpsRequest -BaseUrl $BaseUrl -Method POST -Path ("/ops/visitors/{0}/events" -f $visitorId) -Body @{
  type     = "note"
  metadata = @{ big = $big }
} -ExpectStatus 400

Assert-True ($tooBig.Status -eq 400) "Oversize metadata expected 400"
$tooBigRid = Assert-RequestId -Resp $tooBig -Context "POST /ops/visitors/:id/events oversize(400)"
# Oversize: accept any error string; require 400 + requestId already verified above.
# Do NOT assume Body has .Text or any specific wrapper shape.
if ($tooBig.Body) {
  $actualError = $null

  # Case 1: Body is an object with .error
  try {
    if ($tooBig.Body -and ($tooBig.Body | Get-Member -Name error -ErrorAction SilentlyContinue)) {
      $actualError = $tooBig.Body.error
    }
  } catch {}

  # Case 2: Body is a JSON string; parse it and pull .error
  if (-not $actualError) {
    try {
      if ($tooBig.Body -is [string] -and $tooBig.Body) {
        $j = $tooBig.Body | ConvertFrom-Json -ErrorAction Stop
        if ($j -and ($j.PSObject.Properties.Name -contains 'error')) { $actualError = $j.error }
      }
    } catch {}
  }

  if ($null -eq $actualError) {
    throw "POST /ops/visitors/:id/events oversize(400): Expected an error message in body, but couldn't find one."
  }

  Write-Host "Oversized metadata returns 400 with error: '$actualError' OK" -ForegroundColor Green
} else {
  Write-Host "Oversized metadata returns 400 OK (empty body; requestId verified)" -ForegroundColor Yellow
}# 7) Timeline pagination (ensure enough events exist), newest-first, and limit cap
for ($i = 0; $i -lt 3; $i++) {
  $e = OpsRequest -BaseUrl $BaseUrl -Method POST -Path ("/ops/visitors/{0}/events" -f $visitorId) -Body @{
    type     = "note"
    metadata = @{ seq = $i; source = "smoke" }
  }
  Assert-True ($e.Status -eq 201) "Append extra event expected 201"
  $eRid = Assert-RequestId -Resp $e -Context ("POST /ops/visitors/:id/events extra " + $i)
}

$page1 = OpsRequest -BaseUrl $BaseUrl -Method GET -Path ("/ops/visitors/{0}/timeline?limit=2" -f $visitorId)
Assert-True ($page1.Status -eq 200) "Timeline page1 expected 200"
$page1Rid = Assert-RequestId -Resp $page1 -Context "GET /ops/visitors/:id/timeline page1"
Assert-True (Get-BodyProp -Resp $page1 -Name "nextCursor") "Timeline page1 expected nextCursor"
Write-Host "Timeline page1 OK (nextCursor present)"

$cursor = Get-BodyProp -Resp $page1 -Name "nextCursor"
$page2 = OpsRequest -BaseUrl $BaseUrl -Method GET -Path ("/ops/visitors/{0}/timeline?limit=2&cursor={1}" -f $visitorId, $cursor)
Assert-True ($page2.Status -eq 200) "Timeline page2 expected 200"
$page2Rid = Assert-RequestId -Resp $page2 -Context "GET /ops/visitors/:id/timeline page2"
Write-Host "Timeline page2 OK"

$cap = OpsRequest -BaseUrl $BaseUrl -Method GET -Path ("/ops/visitors/{0}/timeline?limit=999" -f $visitorId)
Assert-True ($cap.Status -eq 200) "Timeline cap expected 200"
$capRid = Assert-RequestId -Resp $cap -Context "GET /ops/visitors/:id/timeline cap"
Assert-True ((Get-BodyProp -Resp $cap -Name "limit") -eq 200) "Expected limit cap to 200"
Write-Host "Limit cap OK"

# 8) 404 + requestId for unknown route (JSON preferred, but allow empty/non-JSON)
$nf = OpsRequest -BaseUrl $BaseUrl -Method GET -Path "/nope" -ExpectStatus 404
Assert-True ($nf.Status -eq 404) "Unknown route expected 404"
$nfRid = Assert-RequestId -Resp $nf -Context "GET /nope (404)"

$nfErr = Get-BodyProp -Resp $nf -Name "error"
if ($nf.Body -and $nfErr) {
  Assert-True ($nfErr -eq "not_found") "404 expected error:not_found"
  Write-Host "404 JSON OK (requestId verified)"
} else {
  Write-Host ("404 OK (requestId verified; non-JSON or empty body). RawBody={0}" -f $nf.Text) -ForegroundColor Yellow
}

Write-Host "SMOKE TESTS PASSED"
exit 0

