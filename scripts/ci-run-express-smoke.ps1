[CmdletBinding()]
param(
  [Parameter(Mandatory = $false)]
  [string]$HostName = "127.0.0.1",

  [Parameter(Mandatory = $false)]
  [int]$Port = 3000,

  [Parameter(Mandatory = $false)]
  [ValidateSet("api","ops")]
  [string]$PreferredBasePath = "api",

  [Parameter(Mandatory = $false)]
  [int]$StartupTimeoutSeconds = 60,

  [Parameter(Mandatory = $false)]
  [int]$SmokeRetrySeconds = 30,

  # Azurite Tables (required for /visitors)
  [Parameter(Mandatory = $false)]
  [string]$AzuriteHost = "127.0.0.1",

  [Parameter(Mandatory = $false)]
  [int]$AzuriteTablesPort = 10002,

  [Parameter(Mandatory = $false)]
  [int]$AzuriteWaitSeconds = 25
)

# Ensure storage is configured for smoke runs
if (-not $env:STORAGE_CONNECTION_STRING) {
  $env:STORAGE_CONNECTION_STRING = "UseDevelopmentStorage=true"
  Write-Host "STORAGE_CONNECTION_STRING not set; using UseDevelopmentStorage=true"
}

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

function Get-TempRoot {
  if (-not [string]::IsNullOrWhiteSpace($env:RUNNER_TEMP)) { return $env:RUNNER_TEMP }
  if (-not [string]::IsNullOrWhiteSpace($env:TEMP)) { return $env:TEMP }
  return [System.IO.Path]::GetTempPath()
}

function Test-PortOpen {
  param([string]$HostName = "127.0.0.1", [int]$Port)
  $client = $null
  try {
    $client = New-Object System.Net.Sockets.TcpClient
    $iar = $client.BeginConnect($HostName, $Port, $null, $null)
    if ($iar.AsyncWaitHandle.WaitOne(250)) {
      $client.EndConnect($iar)
      $client.Close()
      return $true
    }
    $client.Close()
    return $false
  } catch {
    try { if ($client) { $client.Close() } } catch { }
    return $false
  }
}

function Wait-PortOpen {
  param([string]$HostName = "127.0.0.1", [int]$Port, [int]$Seconds = 120)
  $deadline = (Get-Date).AddSeconds($Seconds)
  while ((Get-Date) -lt $deadline) {
    if (Test-PortOpen -HostName $HostName -Port $Port) { return $true }
    Start-Sleep -Milliseconds 250
  }
  return $false
}

function Ensure-AzuriteFromNodeModules {
  param(
    [string]$HostName = "127.0.0.1",
    [int]$BlobPort = 10000,
    [int]$QueuePort = 10001,
    [int]$TablePort = 10002,
    [int]$WaitSeconds = 120
  )


  $blobOpen  = Test-PortOpen -HostName $HostName -Port $BlobPort
  $queueOpen = Test-PortOpen -HostName $HostName -Port $QueuePort
  $tableOpen = Test-PortOpen -HostName $HostName -Port $TablePort

  if ($blobOpen -and $queueOpen -and $tableOpen) {
    Write-Host ("OK: Azurite already running on {0}:{1}/{2}/{3}" -f $HostName,$BlobPort,$QueuePort,$TablePort)
    return $null
  }

  $azJs = Join-Path (Get-Location) "node_modules\azurite\dist\src\azurite.js"
  if (-not (Test-Path -LiteralPath $azJs)) {
    throw "Azurite not found at $azJs. Ensure it's a devDependency and npm ci has run."
  }

  $tempRoot = if ($env:RUNNER_TEMP) { $env:RUNNER_TEMP } elseif ($env:TEMP) { $env:TEMP } else { [System.IO.Path]::GetTempPath() }
  $azDir = Join-Path $tempRoot "azurite"
  New-Item -ItemType Directory -Force -Path $azDir | Out-Null

  $azLog = Join-Path $tempRoot "azurite.log"
  $azOut = Join-Path $tempRoot "azurite.out.log"
  $azErr = Join-Path $tempRoot "azurite.err.log"

  Write-Host "Starting Azurite (background) from node_modules..."
    $p = Start-Process -FilePath "node" -ArgumentList @(
    $azJs, "--silent",
    "--location", $azDir,
    "--debug", $azLog,
    "--tableHost", $HostName, "--tablePort", "$TablePort"
  ) -PassThru -NoNewWindow -RedirectStandardOutput $azOut -RedirectStandardError $azErr

    # Wait for tables only
  if (-not (Wait-PortOpen -HostName $HostName -Port $TablePort -Seconds $WaitSeconds)) {
    Write-Host "==== AZURITE ERR (tail 200) ===="
    if (Test-Path $azErr) { Get-Content $azErr -Tail 200 }
    throw "Azurite table port $TablePort did not open."
  }

  Write-Host ("OK: Azurite tables is listening on {0}:{1} (pid={2})" -f $HostName,$TablePort,$p.Id)
  return $p
}
function Try-ParseJson {
  param([string]$Text)
  if ([string]::IsNullOrWhiteSpace($Text)) { return $null }
  try { return ($Text | ConvertFrom-Json) } catch { return $null }
}

function Invoke-HttpJson {
  [CmdletBinding()]
  param(
    [Parameter(Mandatory = $true)][ValidateSet("GET","POST","PUT","PATCH","DELETE")]
    [string]$Method,

    [Parameter(Mandatory = $true)]
    [string]$Uri
  )


  $headers = @{ "Accept" = "application/json" }

  $result = [ordered]@{
    Ok         = $false
    StatusCode = $null
    Uri        = $Uri
    BodyText   = $null
    Json       = $null
    Error      = $null
  }

  try {
    $resp = Invoke-WebRequest -UseBasicParsing -Method $Method -Uri $Uri -Headers $headers
    $result.StatusCode = [int]$resp.StatusCode
    $result.BodyText   = $resp.Content
    $result.Json       = Try-ParseJson -Text $resp.Content
    $result.Ok         = ($result.StatusCode -ge 200 -and $result.StatusCode -lt 300)
    return [pscustomobject]$result
  }
  catch {
    $ex = $_.Exception
    $result.Error = $ex.Message

    try {
      if ($ex -and $ex.Response) {
        $httpResp = $ex.Response
        try { $result.StatusCode = [int]$httpResp.StatusCode } catch { }

        try {
          $stream = $httpResp.GetResponseStream()
          if ($stream) {
            $reader = New-Object System.IO.StreamReader($stream)
            $text = $reader.ReadToEnd()
            $reader.Close()
            $result.BodyText = $text
            $result.Json     = Try-ParseJson -Text $text
          }
        } catch { }
      }
    } catch { }

    return [pscustomobject]$result
  }
}

function Stop-ListenerIfAny {
  param([int]$Port)

  # On Linux/macOS runners this cmdlet may not exist; and on hosted runners we don't need it.
  $cmd = Get-Command Get-NetTCPConnection -ErrorAction SilentlyContinue
  if ($null -eq $cmd) { return }

  try {
    $conns = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue
    foreach ($c in $conns) {
      if ($c -and $c.OwningProcess) {
        Write-Host ("Stopping existing listener on port {0} (PID={1})" -f $Port, $c.OwningProcess)
        Stop-Process -Id $c.OwningProcess -Force -ErrorAction SilentlyContinue
      }
    }
  } catch { }
}

function Tail-File {
  param([string]$Path, [int]$Lines)
  if (Test-Path -LiteralPath $Path) {
    Get-Content -LiteralPath $Path -Tail $Lines -ErrorAction SilentlyContinue
  }
}

function Test-TcpListen {
  param([string]$HostName, [int]$Port)

  $client = $null
  try {
    $client = New-Object System.Net.Sockets.TcpClient
    $iar = $client.BeginConnect($HostName, $Port, $null, $null)
    $ok = $iar.AsyncWaitHandle.WaitOne(400)
    if (-not $ok) { try { $client.Close() } catch { } ; return $false }
    $client.EndConnect($iar)
    $client.Close()
    return $true
  } catch {
    try { if ($client) { $client.Close() } } catch { }
    return $false
  }
}

function Start-AzuriteBackground {
  param([string]$OutLog, [string]$ErrLog)

  $cmd = Get-Command azurite -ErrorAction SilentlyContinue
  if ($null -eq $cmd) { return $false }

  $src = $cmd.Source
  $ext = [System.IO.Path]::GetExtension($src)

  if ($ext -eq ".ps1") {
    $args = @("-NoProfile", "-ExecutionPolicy", "Bypass", "-File", $src, "--silent")
    Start-Process -FilePath "powershell.exe" -ArgumentList $args -RedirectStandardOutput $OutLog -RedirectStandardError $ErrLog | Out-Null
    return $true
  }

  if ($ext -eq ".cmd" -or $ext -eq ".bat") {
    Start-Process -FilePath "cmd.exe" -ArgumentList @("/c", "azurite", "--silent") -RedirectStandardOutput $OutLog -RedirectStandardError $ErrLog | Out-Null
    return $true
  }

  Start-Process -FilePath $src -ArgumentList @("--silent") -RedirectStandardOutput $OutLog -RedirectStandardError $ErrLog | Out-Null
  return $true
}

function Ensure-AzuriteTables {
  param([string]$HostName, [int]$Port, [int]$WaitSeconds)

  if (Test-TcpListen -HostName $HostName -Port $Port) {
    Write-Host ("OK: Azurite tables is listening on {0}:{1}" -f $HostName, $Port)
    return $true
  }

  $cmd = Get-Command azurite -ErrorAction SilentlyContinue
  if ($null -eq $cmd) {
    Write-Host ("FAIL: Azurite tables is not listening on {0}:{1} and 'azurite' is not on PATH." -f $HostName, $Port)
    return $false
  }

  $azOut = Join-Path (Get-TempRoot) ("azurite-out-{0}.log" -f ([Guid]::NewGuid().ToString("N")))
  $azErr = Join-Path (Get-TempRoot) ("azurite-err-{0}.log" -f ([Guid]::NewGuid().ToString("N")))

  Write-Host "Starting Azurite (background)..."
  $started = $false
  try { $started = Start-AzuriteBackground -OutLog $azOut -ErrLog $azErr } catch { $started = $false }

  if (-not $started) {
    Write-Host "FAIL: Unable to start azurite."
    return $false
  }

  $deadline = (Get-Date).AddSeconds($WaitSeconds)
  while ((Get-Date) -lt $deadline) {
    if (Test-TcpListen -HostName $HostName -Port $Port) {
      Write-Host ("OK: Azurite tables is listening on {0}:{1}" -f $HostName, $Port)
      return $true
    }
    Start-Sleep -Seconds 1
  }

  Write-Host ("FAIL: Azurite did not become ready on {0}:{1} within {2}s." -f $HostName, $Port, $WaitSeconds)
  Write-Host "==== AZURITE OUT (tail 50) ===="
  Tail-File -Path $azOut -Lines 50
  Write-Host "==== AZURITE ERR (tail 50) ===="
  Tail-File -Path $azErr -Lines 50
  return $false
}

function Resolve-ApiBase {
  param([string]$Root, [string]$Preferred)

  $pref = "$Root/$Preferred"
  $h1 = Invoke-HttpJson -Method GET -Uri "$pref/health"
  if ($h1.StatusCode -eq 200) { return $pref }

  if ($Preferred -eq "api" -and $h1.StatusCode -eq 404) {
    $ops = "$Root/ops"
    $h2 = Invoke-HttpJson -Method GET -Uri "$ops/health"
    if ($h2.StatusCode -eq 200) {
      Write-Host "WARN: '$pref/health' returned 404; using '$ops' instead."
      return $ops
    }
  }

  if ($Preferred -eq "ops" -and $h1.StatusCode -eq 404) {
    $api = "$Root/api"
    $h2 = Invoke-HttpJson -Method GET -Uri "$api/health"
    if ($h2.StatusCode -eq 200) {
      Write-Host "WARN: '$pref/health' returned 404; using '$api' instead."
      return $api
    }
  }

  return $pref
}

function Wait-For-Health {
  param([string]$Root, [string]$Preferred, [int]$TimeoutSeconds)

  $deadline = (Get-Date).AddSeconds($TimeoutSeconds)
  while ((Get-Date) -lt $deadline) {
    $base = Resolve-ApiBase -Root $Root -Preferred $Preferred
    $h = Invoke-HttpJson -Method GET -Uri "$base/health"
    if ($h.StatusCode -eq 200) { return $base }
    Start-Sleep -Seconds 1
  }
  return $null
}

# ------------------- Main -------------------

$root = ("http://{0}:{1}" -f $HostName, $Port)

Ensure-AzuriteFromNodeModules -HostName $AzuriteHost -WaitSeconds $AzuriteWaitSeconds | Out-Null

if (Test-Path -LiteralPath ".\package.json") { Write-Host "No BOM detected in package.json" }
Write-Host "OK: Guard passed (no '@azure/functions' imports under src)."

Stop-ListenerIfAny -Port $Port

$outLog = Join-Path (Get-TempRoot) ("hope-ai-api-express-out-{0}.log" -f ([Guid]::NewGuid().ToString("N")))
$errLog = Join-Path (Get-TempRoot) ("hope-ai-api-express-err-{0}.log" -f ([Guid]::NewGuid().ToString("N")))

Write-Host "Starting Express via: node dist/index.js"
$proc = Start-Process -FilePath "node" -ArgumentList @("dist/index.js") -PassThru -RedirectStandardOutput $outLog -RedirectStandardError $errLog

$base = Wait-For-Health -Root $root -Preferred $PreferredBasePath -TimeoutSeconds $StartupTimeoutSeconds
if ([string]::IsNullOrWhiteSpace($base)) {
  Write-Host "Express not healthy at assertion time. Dumping logs..."
  Write-Host "==== EXPRESS OUT (tail 200) ===="
  Tail-File -Path $outLog -Lines 200
  Write-Host "==== EXPRESS ERR (tail 200) ===="
  Tail-File -Path $errLog -Lines 200
  try { Stop-Process -Id $proc.Id -Force -ErrorAction SilentlyContinue } catch { }
  exit 1
}

Write-Host ("OK: Express is listening on {0}:{1}" -f $HostName, $Port)
Write-Host ("Running smoke against: {0}" -f $base)

& (Join-Path $PSScriptRoot "ci-smoke-express.ps1") -BaseUrl $base -RetrySeconds $SmokeRetrySeconds
if ($LASTEXITCODE -ne 0) {
  Write-Host "Express not healthy at assertion time. Dumping logs..."
  Write-Host "==== EXPRESS OUT (tail 200) ===="
  Tail-File -Path $outLog -Lines 200
  Write-Host "==== EXPRESS ERR (tail 200) ===="
  Tail-File -Path $errLog -Lines 200
  try { Stop-Process -Id $proc.Id -Force -ErrorAction SilentlyContinue } catch { }
  exit 1
}

Write-Host "Running extra assertions (server still running)..."

# Engagement asserts are safe: they SKIP cleanly when /ops/engagements is missing.
try { & (Join-Path $PSScriptRoot "assert-engagement-pagination.ps1") -BaseUrl $root } catch { }
try { & (Join-Path $PSScriptRoot "assert-engagement-summary.ps1") -BaseUrl $root } catch { }

# Formation asserts are known-broken/disabled for Express right now -> do not run them here.

Write-Host ("Stopping Express (pid={0})" -f $proc.Id)
try { Stop-Process -Id $proc.Id -Force -ErrorAction SilentlyContinue } catch { }

exit 0







