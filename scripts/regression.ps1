param(
  [string]$RepoRoot = (Get-Location).Path,
  [string]$BaseUrl = "http://127.0.0.1:7071/api"
)

$ErrorActionPreference = "Stop"

Write-Host "=== HOPE AI REGRESSION CHECKS ==="
Write-Host "RepoRoot: $RepoRoot"
Write-Host "BaseUrl:  $BaseUrl"

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
$e1 = @{ visitorId = $vid; eventType = "DEV"; notes = "regression engagement 1"; channel="api"; source="regression" } | ConvertTo-Json
$e2 = @{ visitorId = $vid; eventType = "DEV"; notes = "regression engagement 2"; channel="api"; source="regression" } | ConvertTo-Json

$e1r = Invoke-JsonSafe -Method "POST" -Uri "$BaseUrl/engagements" -Headers $headers -Body $e1
if (-not $e1r.ok) { Fail "POST /engagements (1) failed." }

$e2r = Invoke-JsonSafe -Method "POST" -Uri "$BaseUrl/engagements" -Headers $headers -Body $e2
if (-not $e2r.ok) { Fail "POST /engagements (2) failed." }

Ok "Posted 2 engagements"

# Seed one formation event so we have both kinds
$f = @{
  visitorId = $vid
  type = "FOLLOWUP_ASSIGNED"
  occurredAt = (Get-Date).ToUniversalTime().ToString("o")
  metadata = @{
    assigneeId = "ph6-regression"
    channel = "api"
    notes = "regression seed formation"
  }
} | ConvertTo-Json -Depth 8

$fr = Invoke-JsonSafe -Method "POST" -Uri "$BaseUrl/formation/events" -Headers $headers -Body $f
if (-not $fr.ok) { Fail "POST /formation/events failed." }

Ok "Posted formation event"

# Call timeline page 1
$r1r = Invoke-JsonSafe -Method "GET" -Uri "$BaseUrl/ops/visitors/$vid/timeline?limit=2&kinds=formation,engagement&debug=1" -Headers $headers -Body $null
if (-not $r1r.ok) { Fail "GET timeline page1 failed." }

$r1 = $r1r.body
if (-not $r1.ok) { Fail "timeline page1: ok was false" }
if (-not $r1.items -or $r1.items.Count -lt 1) { Fail "timeline page1: items missing/empty" }

foreach ($it in $r1.items) {
  if (-not $it.kind) { Fail "timeline item missing kind" }
  if (-not $it.occurredAt) { Fail "timeline item missing occurredAt" }
  if (-not $it.display -or [string]::IsNullOrWhiteSpace([string]$it.display)) { Fail "timeline item missing/blank display" }
  if ($null -eq $it.metadata) { Fail "timeline item metadata is null (must be object)" }
  if ($it.metadata -isnot [hashtable] -and $it.metadata.GetType().Name -ne "PSCustomObject") {
    Fail "timeline item metadata is not an object"
  }
}

Ok "Timeline item shape OK (page1)"

if ($r1.nextCursor) {
  $r2r = Invoke-JsonSafe -Method "GET" -Uri "$BaseUrl/ops/visitors/$vid/timeline?limit=2&kinds=formation,engagement&cursor=$($r1.nextCursor)" -Headers $headers -Body $null
  if (-not $r2r.ok) { Fail "GET timeline page2 failed." }

  $r2 = $r2r.body
  if (-not $r2.ok) { Fail "timeline page2: ok was false" }
  if (-not $r2.items) { Fail "timeline page2: items missing" }

  Ok "Timeline cursor paging OK (page2)"
} else {
  Ok "Timeline nextCursor not present (OK for small datasets)"
}

Ok "Regression checks complete."
