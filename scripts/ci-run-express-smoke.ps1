param(
  [int]$Port = 3000,
  [string]$Entry = "dist/index.js",
  [int]$WaitSeconds = 90
)

$ErrorActionPreference = "Stop"

# Pre-flight: free ports (avoid stale node/azurite from previous failed runs)
function Stop-ListenerOnPort([int]$p) {
  $conns = Get-NetTCPConnection -State Listen -LocalPort $p -ErrorAction SilentlyContinue
  if (-not $conns) { return }
  $pids = $conns | Select-Object -ExpandProperty OwningProcess -Unique
  foreach ($procId in $pids) {
    try {
      $proc = Get-Process -Id $procId -ErrorAction Stop
      Write-Host "Stopping process holding port ${p}: pid=$procId name=$($proc.ProcessName)" -ForegroundColor Yellow
      Stop-Process -Id $procId -Force -ErrorAction SilentlyContinue
    } catch {
      Write-Host "Could not stop pid=$procId on port $p (maybe already exited)." -ForegroundColor Yellow
    }
  }
}

Stop-ListenerOnPort $Port
Stop-ListenerOnPort 10002
# Guard: ensure Express-only src does not reference Azure Functions
& "$PSScriptRoot\guard-no-azure-functions.ps1"

# Resolve temp dir (GitHub Actions provides RUNNER_TEMP; local runs may not)
$baseTemp = $env:RUNNER_TEMP
if ([string]::IsNullOrWhiteSpace($baseTemp)) {
  $baseTemp = [System.IO.Path]::GetTempPath()
}

$logRoot = Join-Path $baseTemp "express"
New-Item -ItemType Directory -Force -Path $logRoot | Out-Null

# Unique run dir avoids Windows file-lock collisions
$runDir = Join-Path $logRoot ("run-" + (Get-Date -Format "yyyyMMdd-HHmmss"))
New-Item -ItemType Directory -Force -Path $runDir | Out-Null

$outLog = Join-Path $runDir "express.out.log"
$errLog = Join-Path $runDir "express.err.log"
$azLog  = Join-Path $runDir "azurite.log"
$azOut  = Join-Path $runDir "azurite.out.log"
$azErr  = Join-Path $runDir "azurite.err.log"

# Ensure log files exist
New-Item -ItemType File -Force -Path $outLog,$errLog,$azLog,$azOut,$azErr | Out-Null

# Export log paths so workflow failure-step can dump them too
if ($env:GITHUB_ENV) {
  "EXPRESS_OUT_LOG=$outLog" | Out-File -FilePath $env:GITHUB_ENV -Encoding utf8 -Append
  "EXPRESS_ERR_LOG=$errLog" | Out-File -FilePath $env:GITHUB_ENV -Encoding utf8 -Append
  "AZURITE_LOG=$azLog"      | Out-File -FilePath $env:GITHUB_ENV -Encoding utf8 -Append
  "AZURITE_OUT_LOG=$azOut"  | Out-File -FilePath $env:GITHUB_ENV -Encoding utf8 -Append
  "AZURITE_ERR_LOG=$azErr"  | Out-File -FilePath $env:GITHUB_ENV -Encoding utf8 -Append
}

# Also set env vars so ci-smoke-express.ps1 can tail logs on failures
$env:EXPRESS_OUT_LOG = $outLog
$env:EXPRESS_ERR_LOG = $errLog

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

# Ensure HOPE_API_KEY is set BEFORE starting Express (CI strict; local fallback)
if (-not $env:HOPE_API_KEY) {
  if ($env:GITHUB_ACTIONS -eq "true") {
    throw "HOPE_API_KEY env var is missing. CI must set secrets.HOPE_API_KEY"
  }
  $env:HOPE_API_KEY = "dev-local-key"
  Write-Host "Local run: HOPE_API_KEY was missing; using fallback key 'dev-local-key' for Express + smoke." -ForegroundColor Yellow
}

# Force Azurite storage for LOCAL runs (prevents accidental real Azure calls)
$azConn = "DefaultEndpointsProtocol=http;AccountName=devstoreaccount1;AccountKey=Eby8vdM02xNoGFg==;BlobEndpoint=http://127.0.0.1:10000/devstoreaccount1;QueueEndpoint=http://127.0.0.1:10001/devstoreaccount1;TableEndpoint=http://127.0.0.1:10002/devstoreaccount1;"

if ($env:GITHUB_ACTIONS -ne "true") {
  $env:STORAGE_CONNECTION_STRING = $azConn
  $env:AzureWebJobsStorage       = $azConn
  Write-Host "Local: forced Azurite TableEndpoint 127.0.0.1:10002 for this run." -ForegroundColor Yellow
} else {
  # CI: keep existing secrets if set; fall back to Azurite if missing
  if (-not $env:STORAGE_CONNECTION_STRING -and $env:AzureWebJobsStorage) {
    $env:STORAGE_CONNECTION_STRING = $env:AzureWebJobsStorage
  }
  if (-not $env:STORAGE_CONNECTION_STRING) {
    $env:STORAGE_CONNECTION_STRING = $azConn
    $env:AzureWebJobsStorage       = $azConn
    Write-Host "CI: storage missing; defaulting to Azurite for smoke." -ForegroundColor Yellow
  }
}

Write-Host ("Proof: STORAGE has 127.0.0.1:10002? " + ($env:STORAGE_CONNECTION_STRING -match "127\.0\.0\.1:10002")) -ForegroundColor Cyan
Write-Host ("Proof: AzureWebJobsStorage has 127.0.0.1:10002? " + ($env:AzureWebJobsStorage -match "127\.0\.0\.1:10002")) -ForegroundColor Cyan

# --- Start Azurite (Windows-safe) ---
$azCmd = Join-Path $PSScriptRoot "..\node_modules\.bin\azurite.cmd"
if (-not (Test-Path $azCmd)) { $azCmd = "npx.cmd" }

Write-Host "Starting Azurite..." -ForegroundColor Cyan
if ($azCmd -like "*azurite.cmd") {
  $az = Start-Process -FilePath $azCmd -ArgumentList @("--silent","--location",$runDir,"--debug",$azLog) `
    -WindowStyle Hidden `
    -RedirectStandardOutput $azOut `
    -RedirectStandardError  $azErr `
    -PassThru
} else {
  $az = Start-Process -FilePath $azCmd -ArgumentList @("--yes","azurite","--silent","--location",$runDir,"--debug",$azLog) `
    -WindowStyle Hidden `
    -RedirectStandardOutput $azOut `
    -RedirectStandardError  $azErr `
    -PassThru
}

try {
  if (-not (Wait-Port 10002 30)) {
    Write-Host "Azurite did not open port 10002 in time." -ForegroundColor Yellow
    Write-Host "==== AZURITE LOG (tail 200) ====" -ForegroundColor Yellow
    Tail $azLog 200
    Write-Host "==== AZURITE OUT (tail 200) ====" -ForegroundColor Yellow
    Tail $azOut 200
    Write-Host "==== AZURITE ERR (tail 200) ====" -ForegroundColor Yellow
    Tail $azErr 200
    throw "Azurite failed to start."
  }

  Write-Host "OK: Azurite is listening on 127.0.0.1:10002" -ForegroundColor Green

  # --- Start Express ---
  Write-Host "Starting Express via: node $Entry" -ForegroundColor Cyan
  $env:PORT = "$Port"

  $p = Start-Process -FilePath "node" -ArgumentList @($Entry) `
    -WindowStyle Hidden `
    -RedirectStandardOutput $outLog `
    -RedirectStandardError  $errLog `
    -PassThru

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

  # --- Smoke ---
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
  Write-Host "Smoke failed. Dumping logs..." -ForegroundColor Yellow
  Write-Host "==== EXPRESS OUT (tail 200) ====" -ForegroundColor Yellow
  Tail $outLog 200
  Write-Host "==== EXPRESS ERR (tail 200) ====" -ForegroundColor Yellow
  Tail $errLog 200
  Write-Host "==== AZURITE LOG (tail 200) ====" -ForegroundColor Yellow
  Tail $azLog 200
  Write-Host "==== AZURITE OUT (tail 200) ====" -ForegroundColor Yellow
  Tail $azOut 200
  Write-Host "==== AZURITE ERR (tail 200) ====" -ForegroundColor Yellow
  Tail $azErr 200
  throw
} finally {
  if ($p -and -not $p.HasExited) {
    Write-Host "Stopping Express (pid=$($p.Id))" -ForegroundColor Yellow
    Stop-Process -Id $p.Id -Force -ErrorAction SilentlyContinue
  }
  if ($az -and -not $az.HasExited) {
    Write-Host "Stopping Azurite (pid=$($az.Id))" -ForegroundColor Yellow
    Stop-Process -Id $az.Id -Force -ErrorAction SilentlyContinue
  }
}



