param(
  [int]$Port = 3000,
  [string]$Entry = "dist/index.js",
  [int]$WaitSeconds = 90
)


# ---------------------------
# Environment guards (PS5-safe)
# ---------------------------
if ([string]::IsNullOrWhiteSpace($env:HOPE_API_KEY)) {
  $env:HOPE_API_KEY = "dev-local-key"
}

if ([string]::IsNullOrWhiteSpace($env:STORAGE_CONNECTION_STRING) -and [string]::IsNullOrWhiteSpace($env:AzureWebJobsStorage)) {
  $env:STORAGE_CONNECTION_STRING = "UseDevelopmentStorage=true"
}

# ---------------------------
# Stop stale server first (prevents wrong env/api-key)
# ---------------------------
(Get-NetTCPConnection -State Listen -LocalPort $Port -ErrorAction SilentlyContinue).OwningProcess |
  Sort-Object -Unique |
  ForEach-Object {
    try { Stop-Process -Id $_ -Force -ErrorAction SilentlyContinue } catch {}
  }


$ErrorActionPreference = "Stop"



$p = $null
# Guard: ensure Express-only src does not reference Azure Functions
& "$PSScriptRoot\guard-no-azure-functions.ps1"
$runTemp = $env:RUNNER_TEMP
if (-not $runTemp) { $runTemp = $env:TEMP }
if (-not $runTemp) { $runTemp = "." }
$logDir = Join-Path $runTemp "express"
New-Item -ItemType Directory -Force -Path $logDir | Out-Null

$outLog = Join-Path $logDir "express.out.log"
$errLog = Join-Path $logDir "express.err.log"

# Export log paths so workflow failure-step can dump them too
if ($env:GITHUB_ENV) {
  "EXPRESS_OUT_LOG=$outLog" | Out-File -FilePath $env:GITHUB_ENV -Encoding utf8 -Append
  "EXPRESS_ERR_LOG=$errLog" | Out-File -FilePath $env:GITHUB_ENV -Encoding utf8 -Append
}

function Tail([string]$path, [int]$n=200) {
  if (Test-Path $path) { Get-Content $path -Tail $n | ForEach-Object { Write-Host $_ } }
  else { Write-Host "(missing $path)" }
}

function Wait-Port([int]$port, [int]$seconds) {
  $deadline = (Get-Date).AddSeconds($seconds)
  while ((Get-Date) -lt $deadline) {
    $client = New-Object System.Net.Sockets.TcpClient
    try {
      $iar = $client.BeginConnect("127.0.0.1", $port, $null, $null)
      if ($iar.AsyncWaitHandle.WaitOne(500)) {
        $client.EndConnect($iar)
        if ($client.Connected) { return $true }
      }
    } catch {
      # keep waiting
    } finally {
      try { $client.Close() } catch {}
    }
    Start-Sleep -Milliseconds 250
  }
  return $false
}

Write-Host "Starting Express via: node $Entry" -ForegroundColor Cyan
$p = Start-Process -FilePath "node" -ArgumentList @($Entry) `
  -WindowStyle Hidden `
  -RedirectStandardOutput $outLog `
  -RedirectStandardError  $errLog `
  -PassThru

try {
  if (-not (Wait-Port $Port $WaitSeconds)) {
    Write-Host "Express did not open port $Port in time." -ForegroundColor Yellow
    Write-Host "==== EXPRESS OUT (tail 200) ====" -ForegroundColor Yellow
    Tail $outLog 200
    Write-Host "==== EXPRESS ERR (tail 200) ====" -ForegroundColor Yellow
    Tail $errLog 200
    if ($p -and $p.HasExited) { Write-Host "Express exited early with code $($p.ExitCode)" -ForegroundColor Yellow }
    throw "Express port $Port did not open."
  }

  Write-Host "OK: Express is listening on 127.0.0.1:$Port" -ForegroundColor Green

  # Run the smoke script in THE SAME STEP so the process can't disappear between steps
  $baseUrl = "http://127.0.0.1:$Port/api"
  Write-Host "Running smoke against: $baseUrl" -ForegroundColor Cyan
  $cmd = Get-Command pwsh -ErrorAction SilentlyContinue
  $ps = if ($cmd) { $cmd.Source } else { $null }

  if (-not $ps) {
    $cmd = Get-Command powershell -ErrorAction SilentlyContinue
    $ps = if ($cmd) { $cmd.Source } else { $null }
  }

  if (-not $ps) { throw "Neither 'pwsh' nor 'powershell' found on PATH." }

  & $ps -NoProfile -ExecutionPolicy Bypass -File .\scripts\ci-smoke-express.ps1 -BaseUrl $baseUrl -RetrySeconds 60

} catch {
  Write-Host "Smoke failed. Dumping Express logs..." -ForegroundColor Yellow
  Write-Host "==== EXPRESS OUT (tail 200) ====" -ForegroundColor Yellow
  Tail $outLog 200
  Write-Host "==== EXPRESS ERR (tail 200) ====" -ForegroundColor Yellow
  Tail $errLog 200
  throw
} finally {
  # Determine if server is still alive via health endpoint (more reliable than $p.HasExited)
  $healthOk = $false
  try {
    $u = "http://127.0.0.1:$Port/api/health"
    $r = Invoke-RestMethod -Method Get -Uri $u -TimeoutSec 3
    if ($r -and $r.ok -eq $true) { $healthOk = $true }
  } catch { $healthOk = $false }

  if (-not $healthOk) {
    Write-Host "Express not healthy at assertion time. Dumping logs..." -ForegroundColor Yellow
    Write-Host "==== EXPRESS OUT (tail 200) ====" -ForegroundColor Yellow
    Tail $outLog 200
    Write-Host "==== EXPRESS ERR (tail 200) ====" -ForegroundColor Yellow
    Tail $errLog 200
    throw "Express was not running/healthy for extra assertions."
  }

  Write-Host "Running extra assertions (server still running)..." -ForegroundColor Cyan

  # Prefer pwsh, fallback to powershell
  $ps = $null
  $cmd = Get-Command pwsh -ErrorAction SilentlyContinue
  if ($cmd) { $ps = $cmd.Source }
  if (-not $ps) {
    $cmd = Get-Command powershell -ErrorAction SilentlyContinue
    if ($cmd) { $ps = $cmd.Source }
  }
  if (-not $ps) { throw "Neither 'pwsh' nor 'powershell' found on PATH." }

  $rootBase = "http://127.0.0.1:$Port"
  & $ps -NoProfile -ExecutionPolicy Bypass -File .\scripts\assert-engagement-pagination.ps1 -BaseUrl $rootBase
  & $ps -NoProfile -ExecutionPolicy Bypass -File .\scripts\assert-formation-pagination.ps1 -BaseUrl $rootBase -ApiKey $env:HOPE_API_KEY
  Write-Host "[CI] Formation idempotency assert"
  & "$PSScriptRoot\assert-formation-idempotency.ps1"
  & $ps -NoProfile -ExecutionPolicy Bypass -File .\scripts\assert-engagement-summary.ps1    -BaseUrl $rootBase

  if ($p) {
    Write-Host "Stopping Express (pid=$($p.Id))" -ForegroundColor Yellow
    Stop-Process -Id $p.Id -Force -ErrorAction SilentlyContinue
  }
}