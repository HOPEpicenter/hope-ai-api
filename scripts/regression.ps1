param(
  [string]$RepoRoot = (Get-Location).Path,
  [string]$BaseUrl = "http://127.0.0.1:3000/api"
)

$ErrorActionPreference = "Stop"

Write-Host "=== HOPE AI REGRESSION CHECKS ==="
Write-Host "RepoRoot: $RepoRoot"
Write-Host "BaseUrl:  $BaseUrl"
Write-Host ""
Write-Host "[0] Preflight: API reachable"

function Test-ApiReachable {
  param(
    [Parameter(Mandatory=$true)][string]$BaseUrl,
    [int]$MaxAttempts = 6,
    [int]$DelaySeconds = 5,
    [int]$TimeoutSec = 10
  )

  $healthUrl = "$BaseUrl/health"
  $probeUrls = @($healthUrl, $BaseUrl)
  $lastErrors = @()

  for ($attempt = 1; $attempt -le $MaxAttempts; $attempt++) {
    Write-Host ("[preflight] Reachability attempt {0}/{1}" -f $attempt, $MaxAttempts)

    foreach ($probeUrl in $probeUrls) {
      try {
        $resp = Invoke-WebRequest -Method GET -Uri $probeUrl -UseBasicParsing -TimeoutSec $TimeoutSec -ErrorAction Stop
        $statusCode = [int]$resp.StatusCode
        Write-Host ("[preflight] OK {0} -> HTTP {1}" -f $probeUrl, $statusCode) -ForegroundColor Green
        return
      } catch {
        $msg = $_.Exception.Message
        $lastErrors += ("attempt {0} :: {1} :: {2}" -f $attempt, $probeUrl, $msg)
        Write-Host ("[preflight] miss {0} -> {1}" -f $probeUrl, $msg) -ForegroundColor Yellow
      }
    }

    if ($attempt -lt $MaxAttempts) {
      Write-Host ("[preflight] waiting {0}s before retry..." -f $DelaySeconds)
      Start-Sleep -Seconds $DelaySeconds
    }
  }

  $detail = $lastErrors | Select-Object -Last 4
  throw ("API not reachable at BaseUrl={0} after {1} attempts. Tried {2}. Recent errors: {3}" -f `
    $BaseUrl, `
    $MaxAttempts, `
    ($probeUrls -join ", "), `
    ($detail -join " | "))
}

Test-ApiReachable -BaseUrl $BaseUrl

function Fail($msg) {
  Write-Host "[FAIL] $msg" -ForegroundColor Red
  exit 1
}

function Ok($msg) {
  Write-Host "[OK]   $msg" -ForegroundColor Green
}

function Read-ErrorResponseBody($err) {
  try {
    $resp = $err.Exception.Response
    if ($resp -and $resp.GetResponseStream) {
      $stream = $resp.GetResponseStream()
      if ($stream) {
        $reader = New-Object System.IO.StreamReader($stream)
        $text = $reader.ReadToEnd()
        $reader.Close()
        return $text
      }
    }
  } catch { }
  return $null
}

function Invoke-JsonSafe {
  param(
    [string]$Method,
    [string]$Uri,
    [hashtable]$Headers,
    [string]$Body,
    [string]$ContentType = "application/json"
  )

  try {
    if ($Method -eq "GET") {
      $obj = Invoke-RestMethod -Method Get -Uri $Uri -Headers $Headers
      return @{ ok = $true; status = 200; body = $obj; raw = $null }
    } else {
      $obj = Invoke-RestMethod -Method $Method -Uri $Uri -Headers $Headers -ContentType $ContentType -Body $Body
      return @{ ok = $true; status = 200; body = $obj; raw = $null }
    }
  } catch {
    $raw = Read-ErrorResponseBody $_
    return @{ ok = $false; status = $null; body = $null; raw = $raw; error = $_ }
  }
}

function Invoke-JsonWithRetry {
  param(
    [Parameter(Mandatory=$true)][string]$Label,
    [Parameter(Mandatory=$true)][string]$Method,
    [Parameter(Mandatory=$true)][string]$Uri,
    [hashtable]$Headers,
    [string]$Body,
    [string]$ContentType = "application/json",
    [int]$Attempts = 5,
    [int]$DelaySeconds = 2
  )

  $last = $null

  for ($attempt = 1; $attempt -le $Attempts; $attempt++) {
    $last = Invoke-JsonSafe -Method $Method -Uri $Uri -Headers $Headers -Body $Body -ContentType $ContentType
    if ($last.ok) {
      return $last
    }

    $statusText = ""
    if ($last.status) { $statusText = " status=$($last.status)" }

    Write-Host ""
    Write-Host ("{0} failed on attempt {1}/{2}:{3}" -f $Label, $attempt, $Attempts, $statusText) -ForegroundColor Yellow
    Write-Host ("url: {0}" -f $Uri) -ForegroundColor Yellow
    if ($last.raw) { Write-Host $last.raw } else { Write-Host "(no body captured)" }
    if ($last.error) { Write-Host $last.error.Exception.Message }

    if ($attempt -lt $Attempts) {
      Start-Sleep -Seconds $DelaySeconds
      continue
    }

    Fail ("{0} failed after retries." -f $Label)
  }

  Fail ("{0} failed after retries." -f $Label)
}

# -----------------------------
# 1) Block ad-hoc TableClient creation
# -----------------------------
Write-Host ""
Write-Host "[1] Guard: prevent ad-hoc new TableClient(...) usage"

$srcRoot = Join-Path $RepoRoot "src"
if (-not (Test-Path $srcRoot)) { Fail "src folder not found at $srcRoot" }

$allowedFiles = @(
  (Join-Path $srcRoot "shared\storage\makeTableClient.ts")
)

$hits = @()

$allTs = Get-ChildItem -Path $srcRoot -Recurse -File -Filter *.ts
foreach ($f in $allTs) {
  $content = Get-Content -Path $f.FullName -Raw
  if ($content -match "new\s+TableClient\s*\(") {
    $isAllowed = $false
    foreach ($a in $allowedFiles) {
      if ($f.FullName.ToLower() -eq $a.ToLower()) { $isAllowed = $true; break }
    }
    if (-not $isAllowed) { $hits += $f.FullName }
  }
}

if ($hits.Count -gt 0) {
  Write-Host ""
  Write-Host "Found disallowed TableClient constructions:" -ForegroundColor Yellow
  $hits | ForEach-Object { Write-Host " - $_" }
  Fail "Do not construct TableClient directly outside makeTableClient.ts. Use makeTableClient/formationTables."
} else {
  Ok "No disallowed new TableClient(...) usage found."
}

# -----------------------------
# 2) Ensure build stays clean
# -----------------------------
Write-Host ""
Write-Host "[2] Build sanity: npm run build"

Push-Location $RepoRoot
try {
  npm run build | ForEach-Object { $_ }
  Ok "npm run build succeeded."

Write-Host "[2a] Integration summary derivation assertions"
pwsh -NoProfile -ExecutionPolicy Bypass -File (Join-Path $PSScriptRoot "assert-integration-summary-derive.ps1")
if ($LASTEXITCODE -ne 0) { Fail "Integration summary derivation assertions failed (exit=$LASTEXITCODE)" }
Ok "Integration summary derivation assertions passed."
}
finally {
  Pop-Location
}

# -----------------------------
# 3) Timeline contract check (requires Functions running)
# -----------------------------
Write-Host ""
Write-Host "[3] API contract: timeline cursor + item shape (requires func start)"

if (-not $env:HOPE_API_KEY) {
  Fail "HOPE_API_KEY env var is not set in this shell."
}

$headers = @{ "x-api-key" = $env:HOPE_API_KEY }

# Create a visitor
$body = @{
  name   = "Regression Smoke"
  email  = ("regression+" + (Get-Date -Format "yyyyMMddHHmmss") + "@example.com")
  source = "regression"
} | ConvertTo-Json

$createResp = Invoke-JsonSafe -Method "POST" -Uri "$BaseUrl/visitors" -Headers $headers -Body $body

if (-not $createResp.ok) {
  Write-Host ""
  Write-Host "POST /visitors failed. Raw response (if any):" -ForegroundColor Yellow
  if ($createResp.raw) { Write-Host $createResp.raw } else { Write-Host "(no body captured)" }
  Fail ("POST /visitors request failed: " + ($createResp.error.Exception.Message))
}

$create = $createResp.body
$vid = $null

# Accept either { visitorId } or { ok, visitorId }
if ($create -and $create.visitorId) {
  $vid = [string]$create.visitorId
}

if (-not $vid) {
  Write-Host ""
  Write-Host "POST /visitors returned unexpected JSON:" -ForegroundColor Yellow
  $create | ConvertTo-Json -Depth 20 | ForEach-Object { Write-Host $_ }
  Fail "POST /visitors succeeded but visitorId was missing."
}

Ok "Created visitorId=$vid"

# Create a couple engagements to ensure paging has data
$e1 = @{
  v          = 1
  eventId    = ("evt-" + ([Guid]::NewGuid().ToString("N")))
  visitorId  = $vid
  type       = "note.add"
  occurredAt = (Get-Date).ToUniversalTime().ToString("o")
  source     = @{ system = "scripts/regression.ps1" }
  data       = @{ text = "regression engagement 1"; channel = "api" }
} | ConvertTo-Json -Depth 8
$e2 = @{
  v          = 1
  eventId    = ("evt-" + ([Guid]::NewGuid().ToString("N")))
  visitorId  = $vid
  type       = "status.transition"
  occurredAt = (Get-Date).ToUniversalTime().ToString("o")
  source     = @{ system = "scripts/regression.ps1" }
  data       = @{ from = "open"; to = "in_progress"; channel = "api" }
} | ConvertTo-Json -Depth 8

$e1r = Invoke-JsonWithRetry -Label "POST /engagements/events (1)" -Method "POST" -Uri "$BaseUrl/engagements/events" -Headers $headers -Body $e1

$e2r = Invoke-JsonWithRetry -Label "POST /engagements/events (2)" -Method "POST" -Uri "$BaseUrl/engagements/events" -Headers $headers -Body $e2

Ok "Posted 2 engagements"

# Seed one formation event so we have both kinds
$formEventId = "evt-$([Guid]::NewGuid().ToString('N'))"
$f = @{
  v          = 1
  eventId    = $formEventId
  visitorId  = $vid
  type       = "FOLLOWUP_ASSIGNED"
  occurredAt = (Get-Date).ToUniversalTime().ToString("o")
  source     = @{ system = "scripts/regression.ps1" }
  data       = @{
    assigneeId = "ph6-regression"
    channel    = "api"
    notes      = "regression seed formation"
  }
} | ConvertTo-Json -Depth 20

$fr = Invoke-JsonWithRetry -Label "POST /formation/events" -Method "POST" -Uri "$BaseUrl/formation/events" -Headers $headers -Body $f

if ($null -eq $fr.body -or $fr.body -eq "") {
  Write-Host "[regression] Formation POST accepted with empty body."
}

Ok "Posted formation event"

# [Timeline sanity] Engagements (public surface)
$etl = Invoke-JsonSafe -Method "GET" -Uri "$BaseUrl/engagements/timeline?visitorId=$vid&limit=2" -Headers $headers -Body $null
if (-not $etl.ok) { Fail "GET /engagements/timeline failed." }
$etlBody = $etl.body
$r1 = $etlBody
if (-not $etlBody.ok) { Fail "engagements timeline: ok was false" }
if (-not $etlBody.items -or $etlBody.items.Count -lt 1) { Fail "engagements timeline: items missing/empty" }

# [Formation sanity] Formation events list (public surface)
$fel = $null
$felBody = $null
$formationListUrl = "$BaseUrl/visitors/$vid/formation/events?limit=10"

for ($attempt = 1; $attempt -le 5; $attempt++) {
  $fel = Invoke-JsonSafe -Method "GET" -Uri $formationListUrl -Headers $headers -Body $null

  if (-not $fel.ok) {
    $statusText = ""
    if ($fel.status) { $statusText = " status=$($fel.status)" }

    Write-Host ""
    Write-Host ("GET formation events list failed on attempt {0}/5:{1}" -f $attempt, $statusText) -ForegroundColor Yellow
    Write-Host ("url: {0}" -f $formationListUrl) -ForegroundColor Yellow
    if ($fel.raw) { Write-Host $fel.raw } else { Write-Host "(no body captured)" }
    if ($fel.error) { Write-Host $fel.error.Exception.Message }

    if ($attempt -lt 5) {
      Start-Sleep -Seconds 2
      continue
    }

    Fail "GET formation events list failed after retries."
  }

  $felBody = $fel.body

  if ($null -eq $felBody) {
    if ($attempt -lt 5) {
      Write-Host "[regression] Formation list body was null; retrying..."
      Start-Sleep -Seconds 2
      continue
    }
    Fail "formation events list: response body was null"
  }

  if (-not $felBody.ok) {
    Write-Host ""
    Write-Host "formation events list body:" -ForegroundColor Yellow
    $felBody | ConvertTo-Json -Depth 20 | ForEach-Object { Write-Host $_ }
    Fail "formation events list: ok was false"
  }

  if ($null -eq $felBody.items) {
    if ($attempt -lt 5) {
      Write-Host "[regression] Formation list items missing on attempt $attempt/5; retrying..."
      Start-Sleep -Seconds 2
      continue
    }

    Write-Host ""
    Write-Host "formation events list body:" -ForegroundColor Yellow
    $felBody | ConvertTo-Json -Depth 20 | ForEach-Object { Write-Host $_ }
    Fail "formation events list: items property missing"
  }

  if ($felBody.items.Count -ge 1) {
    break
  }

  if ($attempt -lt 5) {
    Write-Host "[regression] Formation list empty on attempt $attempt/5; retrying..."
    Start-Sleep -Seconds 2
  }
}

if (-not $felBody.items -or $felBody.items.Count -lt 1) {
  Write-Host ""
  Write-Host ("formation events list final url: {0}" -f $formationListUrl) -ForegroundColor Yellow
  Write-Host "formation events list body:" -ForegroundColor Yellow
  $felBody | ConvertTo-Json -Depth 20 | ForEach-Object { Write-Host $_ }
  Write-Host "formation POST body:" -ForegroundColor Yellow
  if ($null -eq $fr.body -or $fr.body -eq "") { Write-Host "(empty)" } else { $fr.body | ConvertTo-Json -Depth 20 | ForEach-Object { Write-Host $_ } }
  Fail "formation events list: items missing/empty after retries"
}

foreach ($it in $r1.items) {
if (-not $it.type -or [string]::IsNullOrWhiteSpace([string]$it.type)) {
  Fail "timeline item missing/blank type"
}
}

Ok "Timeline item shape OK (page1)"

if ($r1.nextCursor) {
  $r2r = Invoke-JsonSafe -Method "GET" -Uri "$BaseUrl/engagements/timeline?visitorId=$vid&limit=2&cursor=$($r1.nextCursor)" -Headers $headers -Body $null
  if (-not $r2r.ok) { Fail "GET timeline page2 failed." }

  $r2 = $r2r.body
  if (-not $r2.ok) { Fail "timeline page2: ok was false" }
  if (-not $r2.items) { Fail "timeline page2: items missing" }

  Ok "Timeline cursor paging OK (page2)"
} else {
  Ok "Timeline nextCursor not present (OK for small datasets)"
}

Ok "Regression checks complete."
# Add assignedTo integration summary assertion (safe, standalone)
if (-not [string]::IsNullOrWhiteSpace($env:HOPE_API_KEY)) {
  Write-Host "[regression] Integration summary assignedTo contract..."
  pwsh -NoProfile -ExecutionPolicy Bypass -File (Join-Path $PSScriptRoot "assert-integration-summary-assignedto.ps1") -Base ($BaseUrl -replace "/api$","") -ApiKey $env:HOPE_API_KEY
if ($LASTEXITCODE -ne 0) { Fail "Integration summary assignedTo contract failed (exit=$LASTEXITCODE)" }
} else {
  Write-Host "[regression] Skipping assignedTo contract (HOPE_API_KEY not set)."
}
# Add integration summary followupReason/assignedTo consistency assertion (safe, standalone)
if (-not [string]::IsNullOrWhiteSpace($env:HOPE_API_KEY)) {
  Write-Host "[regression] Integration summary followup consistency contract..."
  pwsh -NoProfile -ExecutionPolicy Bypass -File (Join-Path $PSScriptRoot "assert-integration-summary-followup-consistency.ps1") -Base ($BaseUrl -replace "/api$","") -ApiKey $env:HOPE_API_KEY
if ($LASTEXITCODE -ne 0) { Fail "Integration summary followup consistency contract failed (exit=$LASTEXITCODE)" }
} else {
  Write-Host "[regression] Skipping followup consistency contract (HOPE_API_KEY not set)."
}

# Integration summary source transition invariant
if (-not [string]::IsNullOrWhiteSpace($env:HOPE_API_KEY)) {
  Write-Host "[regression] Integration summary source transition contract..."
  pwsh -NoProfile -ExecutionPolicy Bypass -File (Join-Path $PSScriptRoot "assert-integration-summary-source-transition.ps1") -Base ($BaseUrl -replace "/api$","") -ApiKey $env:HOPE_API_KEY
  if ($LASTEXITCODE -ne 0) { Fail "Integration summary source transition contract failed (exit=$LASTEXITCODE)" }
} else {
  Write-Host "[regression] Skipping integration summary source transition contract (HOPE_API_KEY not set)."
}

# Integration summary assignment-only source flag invariant
if (-not [string]::IsNullOrWhiteSpace($env:HOPE_API_KEY)) {
  Write-Host "[regression] Integration summary source flags contract..."
  pwsh -NoProfile -ExecutionPolicy Bypass -File (Join-Path $PSScriptRoot "assert-integration-summary-source-flags.ps1") -Base ($BaseUrl -replace "/api$","") -ApiKey $env:HOPE_API_KEY
  if ($LASTEXITCODE -ne 0) { Fail "Integration summary source flags contract failed (exit=$LASTEXITCODE)" }
} else {
  Write-Host "[regression] Skipping integration summary source flags contract (HOPE_API_KEY not set)."
}

# Integration summary should not synthesize follow-up ownership from unrelated activity
if (-not [string]::IsNullOrWhiteSpace($env:HOPE_API_KEY)) {
  Write-Host "[regression] Integration summary no-false-followup contract..."
  pwsh -NoProfile -ExecutionPolicy Bypass -File (Join-Path $PSScriptRoot "assert-integration-summary-no-false-followup.ps1") -Base ($BaseUrl -replace "/api$","") -ApiKey $env:HOPE_API_KEY
  if ($LASTEXITCODE -ne 0) { Fail "Integration summary no-false-followup contract failed (exit=$LASTEXITCODE)" }
} else {
  Write-Host "[regression] Skipping integration summary no-false-followup contract (HOPE_API_KEY not set)."
}

# Add integration summary late/older event stability assertion (safe, standalone)
if (-not [string]::IsNullOrWhiteSpace($env:HOPE_API_KEY)) {
  Write-Host "[regression] Integration summary late/older events contract..."
  pwsh -NoProfile -ExecutionPolicy Bypass -File (Join-Path $PSScriptRoot "assert-integration-summary-late-older-events.ps1") -Base ($BaseUrl -replace "/api$","") -ApiKey $env:HOPE_API_KEY
if ($LASTEXITCODE -ne 0) { Fail "Integration summary late/older events contract failed (exit=$LASTEXITCODE)" }
} else {
  Write-Host "[regression] Skipping integration summary late/older events contract (HOPE_API_KEY not set)."
}


Write-Host ""
# Add formation milestones v1 contract assertion (safe, standalone)
if (-not [string]::IsNullOrWhiteSpace($env:HOPE_API_KEY)) {
  Write-Host "[regression] Formation idempotency...
pwsh -NoProfile -ExecutionPolicy Bypass -File (Join-Path $PSScriptRoot "assert-formation-stage-metadata-stability.ps1") -ApiBase $BaseUrl -ApiKey $env:HOPE_API_KEY
if ($LASTEXITCODE -ne 0) { throw "Formation stage metadata stability failed ($LASTEXITCODE)" }

Formation idempotency..."
  pwsh -NoProfile -ExecutionPolicy Bypass -File (Join-Path $PSScriptRoot "assert-formation-idempotency.ps1") -ApiBase $BaseUrl
  if ($LASTEXITCODE -ne 0) { throw "Formation idempotency asserts failed ($LASTEXITCODE)" }

  Write-Host "[regression] Formation milestones v1 contract..."
  pwsh -NoProfile -ExecutionPolicy Bypass -File (Join-Path $PSScriptRoot "assert-formation-milestones-v1.ps1") -ApiBase $BaseUrl -ApiKey $env:HOPE_API_KEY
  if ($LASTEXITCODE -ne 0) { throw "Formation milestones v1 asserts failed ($LASTEXITCODE)" }

  Write-Host "[regression] Formation snapshot invariants..."
  pwsh -NoProfile -ExecutionPolicy Bypass -File (Join-Path $PSScriptRoot "assert-formation-snapshot-invariants.ps1") -BaseUrl ($BaseUrl -replace "/api$","") -ApiKey $env:HOPE_API_KEY
  if ($LASTEXITCODE -ne 0) { throw "Formation snapshot invariants failed ($LASTEXITCODE)" }
} else {
  Write-Host "[regression] Skipping formation milestones v1 contract (HOPE_API_KEY not set)."
  Write-Host "[regression] Skipping formation snapshot invariants (HOPE_API_KEY not set)."
}
Write-Host "[4] Auth scoping assertions (401/400 expectations)"
$env:HOPE_RUN_PHASE3_ASSERTS = "1"
pwsh -NoProfile -ExecutionPolicy Bypass -File .\scripts\assert-auth-scoping.ps1 -BaseUrl $BaseUrl
if ($LASTEXITCODE -ne 0) { throw "Auth scoping asserts failed ($LASTEXITCODE)" }

if (-not [string]::IsNullOrWhiteSpace($env:HOPE_API_KEY)) {
  $opsProbeUrl = (($BaseUrl -replace "/api$","") + "/ops/followups")
  Write-Host "[5] OPS followups lifecycle assertions"

  $opsAvailable = $false
  try {
    $null = Invoke-WebRequest -Method GET -Uri $opsProbeUrl -Headers @{ "x-api-key" = $env:HOPE_API_KEY } -UseBasicParsing -TimeoutSec 15 -ErrorAction Stop
    $opsAvailable = $true
  } catch {
    $msg = $_.Exception.Message
    if ($msg -match '404') {
      Write-Host ("[5] Skipping OPS followups lifecycle assertions (endpoint not deployed at {0})." -f $opsProbeUrl) -ForegroundColor Yellow
    } else {
      throw ("OPS followups probe failed at {0}: {1}" -f $opsProbeUrl, $msg)
    }
  }

  if ($opsAvailable) {
    pwsh -NoProfile -ExecutionPolicy Bypass -File (Join-Path $PSScriptRoot "assert-ops-followups.ps1") -BaseUrl ($BaseUrl -replace "/api$","") -ApiKey $env:HOPE_API_KEY
    if ($LASTEXITCODE -ne 0) { throw "OPS followups lifecycle assertions failed ($LASTEXITCODE)" }
  }
} else {
  Write-Host "[5] Skipping OPS followups lifecycle assertions (HOPE_API_KEY not set)."
}


# Visitor engagement timeline (integrated) contract
if (-not [string]::IsNullOrWhiteSpace($env:HOPE_API_KEY)) {
  Write-Host "[regression] Visitor engagement timeline (integrated) contract..."
  pwsh -NoProfile -ExecutionPolicy Bypass -File (Join-Path $PSScriptRoot "assert-visitor-engagement-timeline.ps1") -ApiBaseUrl $BaseUrl -ApiKey $env:HOPE_API_KEY
  if ($LASTEXITCODE -ne 0) { throw "Visitor engagement timeline regression failed ($LASTEXITCODE)" }
  Ok "Visitor engagement timeline regression passed."
} else {
  Write-Host "[regression] Skipping visitor engagement timeline regression (HOPE_API_KEY not set)."
}



# Global unified timeline regression
if (-not [string]::IsNullOrWhiteSpace($env:HOPE_API_KEY)) {
  Write-Host "[regression] Global unified timeline contract..."
  pwsh -NoProfile -ExecutionPolicy Bypass -File (Join-Path $PSScriptRoot "assert-global-integration-timeline.ps1") -ApiBaseUrl $BaseUrl -ApiKey $env:HOPE_API_KEY
  if ($LASTEXITCODE -ne 0) { throw "Global unified timeline regression failed ($LASTEXITCODE)" }
  Ok "Global unified timeline regression passed."
} else {
  Write-Host "[regression] Skipping global timeline regression (HOPE_API_KEY not set)."
}
