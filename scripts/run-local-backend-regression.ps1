param(
  [string]$BaseUrl = "http://127.0.0.1:7071/api",
  [string]$RepoRoot = (Get-Location).Path,
  [string]$ApiKey = $env:HOPE_API_KEY
)

$ErrorActionPreference = "Stop"

if ([string]::IsNullOrWhiteSpace($ApiKey)) {
  throw "HOPE_API_KEY env var is required."
}

function Wait-HttpOk {
  param(
    [Parameter(Mandatory=$true)][string]$Url,
    [int]$Retries = 30,
    [int]$DelaySeconds = 2,
    [System.Diagnostics.Process]$Process = $null,
    [string]$StdOutLog = "",
    [string]$StdErrLog = ""
  )

  for ($i = 1; $i -le $Retries; $i++) {
    if ($null -ne $Process -and $Process.HasExited) {
      Write-Host "[local-backend] Functions host exited early."
      if (Test-Path $StdOutLog) {
        Write-Host "--- func stdout ---"
        Get-Content $StdOutLog -Tail 80
      }
      if (Test-Path $StdErrLog) {
        Write-Host "--- func stderr ---"
        Get-Content $StdErrLog -Tail 80
      }
      throw "Functions host exited before health check passed."
    }

    try {
      $resp = Invoke-WebRequest -Method GET -Uri $Url -UseBasicParsing -TimeoutSec 10
      if ($resp.StatusCode -ge 200 -and $resp.StatusCode -lt 300) {
        return
      }
    } catch {
    }

    Start-Sleep -Seconds $DelaySeconds
  }

  if (Test-Path $StdOutLog) {
    Write-Host "--- func stdout ---"
    Get-Content $StdOutLog -Tail 80
  }
  if (Test-Path $StdErrLog) {
    Write-Host "--- func stderr ---"
    Get-Content $StdErrLog -Tail 80
  }

  throw "Timed out waiting for $Url"
}

function Wait-FunctionRegistered {
  param(
    [Parameter(Mandatory=$true)][string[]]$Names,
    [int]$Retries = 30,
    [int]$DelaySeconds = 2
  )

  for ($i = 1; $i -le $Retries; $i++) {
    try {
      $items = Invoke-RestMethod -Method GET -Uri "http://127.0.0.1:7071/admin/functions" -TimeoutSec 10
      $loaded = @($items | ForEach-Object { $_.name })
      $missing = @($Names | Where-Object { $_ -notin $loaded })
      if ($missing.Count -eq 0) {
        return
      }
    } catch {
    }

    Start-Sleep -Seconds $DelaySeconds
  }

  throw ("Timed out waiting for functions: " + ($Names -join ", "))
}

function Run-Step {
  param(
    [Parameter(Mandatory=$true)][string]$Name,
    [Parameter(Mandatory=$true)][scriptblock]$Action
  )

  Write-Host ""
  Write-Host ("=== {0} ===" -f $Name)
  & $Action
  Write-Host ("[OK] {0}" -f $Name)
}

$funcProc = $null
$runStamp = Get-Date -Format "yyyyMMdd-HHmmss-fff"
$logDir = Join-Path $RepoRoot ".tmp"
New-Item -ItemType Directory -Path $logDir -Force | Out-Null
$stdoutLog = Join-Path $logDir ("func-start-" + $runStamp + ".stdout.log")
$stderrLog = Join-Path $logDir ("func-start-" + $runStamp + ".stderr.log")

try {
  Write-Host "[local-backend] Stopping existing Functions hosts..."
  Get-Process func -ErrorAction SilentlyContinue | Stop-Process -Force

  # Unique per-run log files; no pre-delete needed.

  Run-Step -Name "Build" -Action {
    Push-Location $RepoRoot
    try {
      npm run build
      if ($LASTEXITCODE -ne 0) { throw "Build failed" }
    }
    finally {
      Pop-Location
    }
  }

  Write-Host "[local-backend] Starting Azure Functions host..."
  $funcProc = Start-Process -FilePath "func.cmd" -ArgumentList "start" -WorkingDirectory $RepoRoot -RedirectStandardOutput $stdoutLog -RedirectStandardError $stderrLog -PassThru

  Write-Host "[local-backend] Waiting for health..."
  Wait-HttpOk -Url "$BaseUrl/health" -Process $funcProc -StdOutLog $stdoutLog -StdErrLog $stderrLog

  Write-Host "[local-backend] Waiting for required functions..."
  Wait-FunctionRegistered -Names @(
    "createVisitor",
    "postEngagementEvent",
    "getVisitorSummary",
    "getVisitorJourney"
  )

  Run-Step -Name "Integration summary derivation assertions" -Action {
    pwsh -NoProfile -ExecutionPolicy Bypass -File (Join-Path $RepoRoot "scripts\assert-integration-summary-derive.ps1")
    if ($LASTEXITCODE -ne 0) { throw "assert-integration-summary-derive.ps1 failed" }
  }

  Run-Step -Name "Visitor summary auth check" -Action {
    $body = @{
      name   = "local-runner-summary-check"
      email  = ("summary-check-" + (Get-Date -Format "yyyyMMddHHmmss") + "@example.com")
      source = "local-runner"
    } | ConvertTo-Json

    $visitor = Invoke-RestMethod -Method POST -Uri "$BaseUrl/visitors" -Headers @{ "x-api-key" = $ApiKey } -ContentType "application/json" -Body $body
    $null = Invoke-WebRequest -Method GET -Uri ("$BaseUrl/visitors/{0}/summary" -f $visitor.visitorId) -Headers @{ "x-api-key" = $ApiKey } -UseBasicParsing
  }

  Run-Step -Name "Visitor journey endpoint check" -Action {
    pwsh -NoProfile -ExecutionPolicy Bypass -File (Join-Path $RepoRoot "scripts\assert-visitor-journey.ps1") -ApiBase $BaseUrl -ApiKey $ApiKey
    if ($LASTEXITCODE -ne 0) { throw "assert-visitor-journey.ps1 failed" }
  }

  Run-Step -Name "Visitor summary journey check" -Action {
    pwsh -NoProfile -ExecutionPolicy Bypass -File (Join-Path $RepoRoot "scripts\assert-summary-journey.ps1") -ApiBase $BaseUrl -ApiKey $ApiKey
    if ($LASTEXITCODE -ne 0) { throw "assert-summary-journey.ps1 failed" }
  }

  Run-Step -Name "Journey derivation invariants" -Action {
    pwsh -NoProfile -ExecutionPolicy Bypass -File (Join-Path $RepoRoot "scripts\assert-journey-derivation-invariants.ps1") -ApiBase $BaseUrl -ApiKey $ApiKey
    if ($LASTEXITCODE -ne 0) { throw "assert-journey-derivation-invariants.ps1 failed" }
  }

  Run-Step -Name "Engagement status invariants" -Action {
    pwsh -NoProfile -ExecutionPolicy Bypass -File (Join-Path $RepoRoot "scripts\assert-engagement-status-invariants.ps1") -ApiBase $BaseUrl -ApiKey $ApiKey
    if ($LASTEXITCODE -ne 0) { throw "assert-engagement-status-invariants.ps1 failed" }
  }

  Run-Step -Name "Visitor engagement timeline check" -Action {
    pwsh -NoProfile -ExecutionPolicy Bypass -File (Join-Path $RepoRoot "scripts\assert-visitor-engagement-timeline.ps1") -ApiBaseUrl $BaseUrl -ApiKey $ApiKey
    if ($LASTEXITCODE -ne 0) { throw "assert-visitor-engagement-timeline.ps1 failed" }
  }

  Write-Host ""
  Write-Host "[local-backend] All local backend checks passed."

Write-Host "=== Invalid first transition invariant ==="
pwsh -NoProfile -ExecutionPolicy Bypass -File .\scripts\assert-engagement-transition-invalid-first-transition.ps1
Write-Host "[OK] Invalid first transition invariant"

Write-Host "=== Summary vs engagement-status consistency invariant ==="
pwsh -NoProfile -ExecutionPolicy Bypass -File .\scripts\assert-summary-engagement-status-consistency.ps1
if ($LASTEXITCODE -ne 0) { throw "assert-summary-engagement-status-consistency.ps1 failed" }
Write-Host "[OK] Summary vs engagement-status consistency invariant"

Write-Host "=== Journey vs engagement consistency invariant ==="
pwsh -NoProfile -ExecutionPolicy Bypass -File .\scripts\assert-journey-engagement-consistency.ps1
if ($LASTEXITCODE -ne 0) { throw "assert-journey-engagement-consistency.ps1 failed" }
Write-Host "[OK] Journey vs engagement consistency invariant"

Write-Host "=== Follow-up progression invariants ==="
pwsh -NoProfile -ExecutionPolicy Bypass -File .\scripts\assert-followup-progression-invariants.ps1
if ($LASTEXITCODE -ne 0) { throw "assert-followup-progression-invariants.ps1 failed" }
Write-Host "[OK] Follow-up progression invariants"

Write-Host "=== Invalid follow-up progression invariants ==="
pwsh -NoProfile -ExecutionPolicy Bypass -File .\scripts\assert-followup-invalid-progression-invariants.ps1
if ($LASTEXITCODE -ne 0) { throw "assert-followup-invalid-progression-invariants.ps1 failed" }
Write-Host "[OK] Invalid follow-up progression invariants"

Write-Host "=== Follow-up semantic progression invariant ==="
pwsh -NoProfile -ExecutionPolicy Bypass -File .\scripts\assert-followup-semantic-progression.ps1
if ($LASTEXITCODE -ne 0) { throw "assert-followup-semantic-progression.ps1 failed" }
Write-Host "[OK] Follow-up semantic progression invariant"

Write-Host "=== Follow-up integration consistency invariant ==="
pwsh -NoProfile -ExecutionPolicy Bypass -File .\scripts\assert-followup-integration-consistency.ps1
if ($LASTEXITCODE -ne 0) { throw "assert-followup-integration-consistency.ps1 failed" }
Write-Host "[OK] Follow-up integration consistency invariant"

Write-Host "=== Follow-up reason accuracy invariant ==="
pwsh -NoProfile -ExecutionPolicy Bypass -File .\scripts\assert-followup-reason-accuracy.ps1
if ($LASTEXITCODE -ne 0) { throw "assert-followup-reason-accuracy.ps1 failed" }
Write-Host "[OK] Follow-up reason accuracy invariant"

Write-Host "=== Follow-up resolution semantics invariant ==="
pwsh -NoProfile -ExecutionPolicy Bypass -File .\scripts\assert-followup-resolution-semantics.ps1
if ($LASTEXITCODE -ne 0) { throw "assert-followup-resolution-semantics.ps1 failed" }
Write-Host "[OK] Follow-up resolution semantics invariant"
}
finally {
  if ($null -ne $funcProc -and -not $funcProc.HasExited) {

Write-Host "=== Engagement transition validity invariants ==="
pwsh -NoProfile -ExecutionPolicy Bypass -File .\scripts\assert-engagement-transition-validity.ps1
Write-Host "[OK] Engagement transition validity invariants"

    Write-Host "[local-backend] Stopping Azure Functions host..."
    Stop-Process -Id $funcProc.Id -Force
  } else {
    Get-Process func -ErrorAction SilentlyContinue | Stop-Process -Force
  }
}





