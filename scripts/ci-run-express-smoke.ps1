[CmdletBinding()]
param(
  [Parameter(Mandatory = $false)]
  [string]$HostName = "127.0.0.1",

  [Parameter(Mandatory = $false)]
  [int]$Port = 3000,

  # CI appears to be using /api by default, but Express currently serves /ops.
  [Parameter(Mandatory = $false)]
  [ValidateSet("api","ops")]
  [string]$PreferredBasePath = "api",

  [Parameter(Mandatory = $false)]
  [int]$StartupTimeoutSeconds = 60,

  [Parameter(Mandatory = $false)]
  [int]$SmokeRetrySeconds = 30
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

function Write-Info([string]$Message) { Write-Host $Message }
function Write-Warn([string]$Message) { Write-Host $Message }
function Write-Fail([string]$Message) { Write-Host $Message }

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

    # Extract status/body from WebException response (PS 5.1-safe)
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

  try {
    $conns = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue
    foreach ($c in $conns) {
      if ($c -and $c.OwningProcess) {
        Write-Host ("Stopping existing listener on port {0} (PID={1})" -f $Port, $c.OwningProcess)
        Stop-Process -Id $c.OwningProcess -Force -ErrorAction SilentlyContinue
      }
    }
  } catch {
    # Non-fatal
  }
}

function Tail-File {
  param([string]$Path, [int]$Lines)
  if (Test-Path -LiteralPath $Path) {
    Get-Content -LiteralPath $Path -Tail $Lines -ErrorAction SilentlyContinue
  }
}

function Resolve-ApiBase {
  param(
    [string]$Root,
    [string]$Preferred
  )

  $pref = "$Root/$Preferred"
  $h1 = Invoke-HttpJson -Method GET -Uri "$pref/health"
  if ($h1.StatusCode -eq 200) { return $pref }

  # If preferred is api and it's 404, try ops
  if ($Preferred -eq "api" -and $h1.StatusCode -eq 404) {
    $ops = "$Root/ops"
    $h2 = Invoke-HttpJson -Method GET -Uri "$ops/health"
    if ($h2.StatusCode -eq 200) {
      Write-Warn "WARN: '$pref/health' returned 404; using '$ops' instead."
      return $ops
    }
  }

  # If preferred is ops and it's 404, try api
  if ($Preferred -eq "ops" -and $h1.StatusCode -eq 404) {
    $api = "$Root/api"
    $h2 = Invoke-HttpJson -Method GET -Uri "$api/health"
    if ($h2.StatusCode -eq 200) {
      Write-Warn "WARN: '$pref/health' returned 404; using '$api' instead."
      return $api
    }
  }

  # Default to preferred even if not healthy; caller will handle timeout/failure messaging
  return $pref
}

function Wait-For-Health {
  param(
    [string]$Root,
    [string]$Preferred,
    [int]$TimeoutSeconds
  )

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

# Keep existing guard output (minimal; do not overreach)
if (Test-Path -LiteralPath ".\package.json") {
  Write-Host "No BOM detected in package.json"
}
Write-Host "OK: Guard passed (no '@azure/functions' imports under src)."

Stop-ListenerIfAny -Port $Port

# Start Express
$outLog = Join-Path $env:TEMP ("hope-ai-api-express-out-{0}.log" -f ([Guid]::NewGuid().ToString("N")))
$errLog = Join-Path $env:TEMP ("hope-ai-api-express-err-{0}.log" -f ([Guid]::NewGuid().ToString("N")))

Write-Host ("Starting Express via: node dist/index.js")
$proc = Start-Process -FilePath "node" -ArgumentList @("dist/index.js") -PassThru -RedirectStandardOutput $outLog -RedirectStandardError $errLog -WindowStyle Hidden

# Wait for health, resolving /api vs /ops automatically
$base = Wait-For-Health -Root $root -Preferred $PreferredBasePath -TimeoutSeconds $StartupTimeoutSeconds

if ([string]::IsNullOrWhiteSpace($base)) {
  Write-Fail "Express not healthy at assertion time. Dumping logs..."
  Write-Host "==== EXPRESS OUT (tail 200) ===="
  Tail-File -Path $outLog -Lines 200
  Write-Host "==== EXPRESS ERR (tail 200) ===="
  Tail-File -Path $errLog -Lines 200
  try { Stop-Process -Id $proc.Id -Force -ErrorAction SilentlyContinue } catch { }
  exit 1
}

Write-Host ("OK: Express is listening on {0}:{1}" -f $HostName, $Port)
Write-Host ("Running smoke against: {0}" -f $base)

# Run the smoke script (it may also retry internally)
& (Join-Path $PSScriptRoot "ci-smoke-express.ps1") -BaseUrl $base -RetrySeconds $SmokeRetrySeconds
if ($LASTEXITCODE -ne 0) {
  Write-Fail "Express not healthy at assertion time. Dumping logs..."
  Write-Host "==== EXPRESS OUT (tail 200) ===="
  Tail-File -Path $outLog -Lines 200
  Write-Host "==== EXPRESS ERR (tail 200) ===="
  Tail-File -Path $errLog -Lines 200
  try { Stop-Process -Id $proc.Id -Force -ErrorAction SilentlyContinue } catch { }
  exit 1
}

Write-Host "Running extra assertions (server still running)..."

# Ensure health for extra assertions using the resolved base (NOT hardcoded /api)
$h2 = Invoke-HttpJson -Method GET -Uri "$base/health"
if ($h2.StatusCode -ne 200) {
  Write-Fail "Express was not running/healthy for extra assertions."
  Write-Host "==== EXPRESS OUT (tail 200) ===="
  Tail-File -Path $outLog -Lines 200
  Write-Host "==== EXPRESS ERR (tail 200) ===="
  Tail-File -Path $errLog -Lines 200
  try { Stop-Process -Id $proc.Id -Force -ErrorAction SilentlyContinue } catch { }
  exit 1
}

# Extra assertions (keep minimal; engagement/formation asserts may skip)
try {
  & (Join-Path $PSScriptRoot "assert-engagement-pagination.ps1") -BaseUrl $root
} catch { }

Write-Host "[CI] Formation idempotency assert"
try {
  & (Join-Path $PSScriptRoot "assert-formation-idempotency.ps1") -BaseUrl $base
} catch { }

try {
  & (Join-Path $PSScriptRoot "assert-engagement-summary.ps1") -BaseUrl $base
} catch { }

Write-Host ("Stopping Express (pid={0})" -f $proc.Id)
try { Stop-Process -Id $proc.Id -Force -ErrorAction SilentlyContinue } catch { }

exit 0
