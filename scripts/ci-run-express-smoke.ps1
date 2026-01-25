param(
  [int]$Port = 3000,
  [string]$Entry = "dist/index.js",
  [int]$WaitSeconds = 90
)

$ErrorActionPreference = "Stop"


# Guard: ensure Express-only src does not reference Azure Functions
& "$PSScriptRoot\guard-no-azure-functions.ps1"
$logDir = Join-Path $env:RUNNER_TEMP "express"
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
    $ok = Test-NetConnection -ComputerName 127.0.0.1 -Port $port -WarningAction SilentlyContinue
    if ($ok.TcpTestSucceeded) { return $true }
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
  if ($p -and -not $p.HasExited) {
    # --- EXTRA ASSERTIONS (server must still be running) ---
    .\scripts\assert-engagement-pagination.ps1

    Write-Host "Stopping Express (pid=$($p.Id))" -ForegroundColor Yellow
    Stop-Process -Id $p.Id -Force
  }
}

