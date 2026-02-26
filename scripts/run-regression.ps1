param(
  [string]$RepoRoot = (Resolve-Path ".").Path,
  [string]$BaseUrl  = "http://127.0.0.1:3000/api",
  [switch]$KillExisting
)

$ErrorActionPreference = "Stop"

function Get-ListenerPid([int]$Port) {
  try {
    $c = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction Stop | Select-Object -First 1
    if ($c -and $c.OwningProcess) { return [int]$c.OwningProcess }
  } catch { }
  return $null
}

function Wait-Health([string]$HealthUrl, [int]$TimeoutSeconds) {
  $deadline = (Get-Date).AddSeconds($TimeoutSeconds)
  while ((Get-Date) -lt $deadline) {
    try {
      $null = Invoke-RestMethod -Method Get -Uri $HealthUrl -TimeoutSec 3
      return $true
    } catch {
      Start-Sleep -Milliseconds 500
    }
  }
  return $false
}

$u = [Uri]$BaseUrl
$port = $u.Port
$hostBase = "{0}://{1}:{2}" -f $u.Scheme, $u.Host, $u.Port
$health = "$hostBase/api/health"

Write-Host "=== RUN REGRESSION (server-managed) ==="
Write-Host "RepoRoot: $RepoRoot"
Write-Host "BaseUrl:  $BaseUrl"
Write-Host "Health:   $health"
Write-Host "Port:     $port"

$listenPid = Get-ListenerPid -Port $port
if ($listenPid) {
  if ($KillExisting) {
    Write-Host "Killing existing listener on port $port (PID=$listenPid) ..."
    try { Stop-Process -Id $listenPid -Force -ErrorAction SilentlyContinue } catch { }
    Start-Sleep -Milliseconds 300
  } else {
    Write-Host "Listener already running on port $port (PID=$listenPid). Will reuse it (no kill)."
  }
}

# Only start server if not already listening (or if KillExisting removed it)
$startedHere = $false
$regProc = $null
$outLog = Join-Path $RepoRoot ".run-regression-server.out.log"
$errLog = Join-Path $RepoRoot ".run-regression-server.err.log"

try {
  if (-not (Get-ListenerPid -Port $port)) {
    try { Remove-Item -Force -LiteralPath $outLog -ErrorAction SilentlyContinue } catch { }
    try { Remove-Item -Force -LiteralPath $errLog -ErrorAction SilentlyContinue } catch { }

    Write-Host "Starting server: node dist/index.js"
    $regProc = Start-Process -FilePath "node" `
      -ArgumentList @("dist/index.js") `
      -WorkingDirectory $RepoRoot `
      -PassThru -NoNewWindow `
      -RedirectStandardOutput $outLog `
      -RedirectStandardError  $errLog

    $startedHere = $true
  }

  Write-Host "Waiting for health (timeout 60s)..."
  if (-not (Wait-Health -HealthUrl $health -TimeoutSeconds 60)) {
    Write-Host ""
    Write-Host "Server did not become healthy in time." -ForegroundColor Yellow

    if (Test-Path -LiteralPath $outLog) {
      Write-Host "=== STDOUT tail ($outLog) ===" -ForegroundColor Yellow
      Get-Content -LiteralPath $outLog -Tail 200 | ForEach-Object { Write-Host $_ }
    }
    if (Test-Path -LiteralPath $errLog) {
      Write-Host "=== STDERR tail ($errLog) ===" -ForegroundColor Yellow
      Get-Content -LiteralPath $errLog -Tail 200 | ForEach-Object { Write-Host $_ }
    }

    throw "Health check failed: $health"
  }

  Write-Host "Health OK."

  # Run the existing regression script (expects server up)
  Write-Host ""
  Write-Host "Running: scripts/regression.ps1"
  pwsh -NoProfile -ExecutionPolicy Bypass -File (Join-Path $RepoRoot "scripts/regression.ps1") -RepoRoot $RepoRoot -BaseUrl $BaseUrl
  if ($LASTEXITCODE -ne 0) { throw "scripts/regression.ps1 failed (exit=$LASTEXITCODE)" }
  Write-Host ""
  Write-Host "OK: run-regression completed."
}
finally {
  if ($startedHere -and $regProc -and -not $regProc.HasExited) {
    Write-Host "Stopping server started by runner (PID=$($regProc.Id)) ..."
    try { Stop-Process -Id $regProc.Id -Force -ErrorAction SilentlyContinue } catch { }
  }
}

