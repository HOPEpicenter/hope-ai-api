# scripts/run-smoke.ps1
# Builds, starts server on a random port, waits for /ops/health, runs smoke-tests.ps1, then stops server.

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"


# ---- guard: scripts integrity (ops.ps1 etc.) ----
$guard = Join-Path $PSScriptRoot "guard-scripts.ps1"
if (-not (Test-Path -LiteralPath $guard)) {
  throw "Missing guard script: $guard"
}

Write-Host "== Run guard-scripts ==" -ForegroundColor Cyan
powershell -NoProfile -ExecutionPolicy Bypass -File $guard

if ($LASTEXITCODE -ne 0) {
  throw "guard-scripts failed (exit=$LASTEXITCODE)."
}# ---- end guard ----
function Get-ScriptDir {
  $d = $PSScriptRoot
  if (-not $d -or $d.Trim().Length -eq 0) {
    $cwd = (Get-Location).Path
    $maybeScripts = Join-Path $cwd "scripts"
    if (Test-Path $maybeScripts) { return $maybeScripts }
    return $cwd
  }
  return $d
}

function Find-RepoRoot {
  param([Parameter(Mandatory=$true)][string]$StartDir)

  $d = $StartDir
  while ($true) {
    $pkg = Join-Path $d "package.json"
    if (Test-Path $pkg) { return $d }

    $parent = Split-Path $d -Parent
    if (-not $parent -or $parent -eq $d) { break }
    $d = $parent
  }
  throw "Could not find repo root (package.json) starting from: $StartDir"
}

function Import-DotEnv {
  param([Parameter(Mandatory=$true)][string]$Path)

  if (-not (Test-Path $Path)) { return }

  $lines = Get-Content -LiteralPath $Path
  foreach ($line in $lines) {
    $t = $line.Trim()
    if ($t.Length -eq 0) { continue }
    if ($t.StartsWith("#")) { continue }

    $eq = $t.IndexOf("=")
    if ($eq -lt 1) { continue }

    $key = $t.Substring(0, $eq).Trim()
    $val = $t.Substring($eq + 1).Trim()

    if (($val.StartsWith('"') -and $val.EndsWith('"')) -or ($val.StartsWith("'") -and $val.EndsWith("'"))) {
      $val = $val.Substring(1, $val.Length - 2)
    }

    if ($key.Length -gt 0) {
      # do not overwrite existing env vars
      if (-not (Test-Path ("Env:\" + $key))) {
        Set-Item -Path ("Env:\" + $key) -Value $val
      }
    }
  }
}

function Require-Env {
  param([Parameter(Mandatory=$true)][string]$Name)

  $v = [Environment]::GetEnvironmentVariable($Name)
  if (-not $v -or $v.Trim().Length -eq 0) {
    throw "$Name is not set. Set it in your shell OR add it to .env in repo root."
  }
}

function Wait-ForHealth {
  param(
    [Parameter(Mandatory=$true)][string]$BaseUrl,
    [int]$TimeoutSec = 60
  )

  $deadline = (Get-Date).AddSeconds($TimeoutSec)
  $healthUrl = $BaseUrl.TrimEnd("/") + "/ops/health"

  while ((Get-Date) -lt $deadline) {
    try {
      $resp = Invoke-WebRequest -Uri $healthUrl -Method GET -TimeoutSec 5 -UseBasicParsing -ErrorAction Stop
      if ([int]$resp.StatusCode -eq 200) {
        try {
          $obj = $resp.Content | ConvertFrom-Json
          if ($obj.ok -eq $true) { return $true }
        } catch { }
      }
    } catch { }
    Start-Sleep -Milliseconds 300
  }
  return $false
}

$ScriptDir = Get-ScriptDir
$RepoRoot  = Find-RepoRoot -StartDir $ScriptDir

# Load .env if present (repo root)
$envPath = Join-Path $RepoRoot ".env"
if (Test-Path $envPath) {
  Import-DotEnv -Path $envPath
  Write-Host ("Loaded .env from: " + $envPath) -ForegroundColor DarkGray
} else {
  Write-Host ("No .env found at: " + $envPath + " (ok if env vars are set in shell/CI)") -ForegroundColor DarkGray
}# Required for server boot
Require-Env -Name "STORAGE_CONNECTION_STRING"
Write-Host "STORAGE_CONNECTION_STRING is set (value not shown)" -ForegroundColor DarkGray

# Run legacy API error-shape guard (fails CI if old patterns reappear)
$legacyGuard = Join-Path $PSScriptRoot "guard-no-legacy-api-errors.ps1"
if (Test-Path $legacyGuard) {
  & powershell -NoProfile -ExecutionPolicy Bypass -File $legacyGuard
} else {
  Write-Host ("WARN: Legacy-error guard not found at: {0}" -f $legacyGuard) -ForegroundColor Yellow
}
Write-Host "STORAGE_CONNECTION_STRING is set (value not shown)" -ForegroundColor DarkGray
# Logs under repo root
$LogsDir = Join-Path $RepoRoot "logs"
if (-not (Test-Path $LogsDir)) { New-Item -ItemType Directory -Path $LogsDir | Out-Null }

$stamp = (Get-Date).ToString("yyyyMMdd-HHmmss")
$serverOutLog = Join-Path $LogsDir ("smoke-server-{0}.out.log" -f $stamp)
$serverErrLog = Join-Path $LogsDir ("smoke-server-{0}.err.log" -f $stamp)
$runLog       = Join-Path $LogsDir ("smoke-run-{0}.log" -f $stamp)

# Pick a random port
$port = Get-Random -Minimum 20000 -Maximum 45000
$baseUrl = "http://localhost:{0}" -f $port

# Choose which npm script to run for the server (default: start:dist for CI friendliness)
$serverScript = $env:OPS_SERVER_SCRIPT
if (-not $serverScript -or $serverScript.Trim().Length -eq 0) { $serverScript = "start:dist" }

Write-Host ("RepoRoot:      " + $RepoRoot)
Write-Host ("ScriptDir:     " + $ScriptDir)
Write-Host ("Port:          " + $port)
Write-Host ("BaseUrl:       " + $baseUrl)
Write-Host ("ServerScript:  npm run " + $serverScript)
Write-Host ("ServerOutLog:  " + $serverOutLog)
Write-Host ("ServerErrLog:  " + $serverErrLog)
Write-Host ("RunLog:        " + $runLog)

Push-Location $RepoRoot
$serverProc = $null
try {
  Write-Host "`n== npm run build =="
  & npm run build 2>&1 | Tee-Object -FilePath $runLog -Append | Out-Host
  if ($LASTEXITCODE -ne 0) { throw "npm run build failed (exit=$LASTEXITCODE). See $runLog" }

  Write-Host "`n== Start server =="
  $cmd = "set ""PORT={0}""&& set ""OPS_PORT={0}""&& npm run {1}" -f $port, $serverScript
  $serverProc = Start-Process -FilePath "cmd.exe" -ArgumentList "/c", $cmd `
    -WorkingDirectory $RepoRoot `
    -RedirectStandardOutput $serverOutLog `
    -RedirectStandardError  $serverErrLog `
    -NoNewWindow `
    -PassThru

  Write-Host ("Server PID: " + $serverProc.Id)

  Write-Host "`n== Wait for /ops/health =="
  $ok = Wait-ForHealth -BaseUrl $baseUrl -TimeoutSec 60
  if (-not $ok) {
    Write-Host "`n--- Server stdout (tail) ---"
    if (Test-Path $serverOutLog) { Get-Content $serverOutLog -Tail 120 | ForEach-Object { Write-Host $_ } }
    Write-Host "`n--- Server stderr (tail) ---"
    if (Test-Path $serverErrLog) { Get-Content $serverErrLog -Tail 200 | ForEach-Object { Write-Host $_ } }
    throw "Server did not become healthy within timeout. See $serverOutLog and $serverErrLog"
  }
  Write-Host "Health OK"

  Write-Host "`n== Run smoke tests =="
  $smokePath = Join-Path $ScriptDir "smoke-tests.ps1"
  if (-not (Test-Path $smokePath)) { throw "Smoke tests file not found: $smokePath" }

  $cmdSmoke = "set ""OPS_BASE_URL={0}""&& powershell -NoProfile -ExecutionPolicy Bypass -File ""{1}"" -BaseUrl ""{0}""" -f $baseUrl, $smokePath
  $p = Start-Process -FilePath "cmd.exe" -ArgumentList "/c", $cmdSmoke `
    -WorkingDirectory $RepoRoot `
    -NoNewWindow `
    -Wait `
    -PassThru

  if ($p.ExitCode -ne 0) {
    throw "Smoke tests failed (exit=$($p.ExitCode)). See $serverOutLog, $serverErrLog, and $runLog"
  }

  Write-Host "`n✅ run-smoke completed successfully" -ForegroundColor Green
  exit 0
}
catch {
  Write-Host "`n❌ run-smoke failed: $($_.Exception.Message)" -ForegroundColor Red
  Write-Host ("See logs: " + $serverOutLog + " ; " + $serverErrLog + " ; " + $runLog)
  exit 1
}
finally {
  Pop-Location
  if ($serverProc -and -not $serverProc.HasExited) {
    try {
      Write-Host "`n== Stop server =="
      Stop-Process -Id $serverProc.Id -Force -ErrorAction SilentlyContinue
    } catch { }
  }
}





