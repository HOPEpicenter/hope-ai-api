# scripts/run-smoke-remote.ps1
# Runs remote smoke checks against a deployed environment.
# Requires: OPS_BASE_URL and HOPE_API_KEY.
# Supports either:
#   - ops host exposing /ops/*
#   - Functions host exposing /api/*

[CmdletBinding()]
param(
  [Parameter(Mandatory=$false)]
  [string]$BaseUrl = $env:OPS_BASE_URL,

  [Parameter(Mandatory=$false)]
  [string]$ApiKey = $env:HOPE_API_KEY
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"
$ProgressPreference = "SilentlyContinue"

function Require-Value([string]$Name, [string]$Value) {
  if ([string]::IsNullOrWhiteSpace($Value)) {
    throw "$Name is required. Set env:$Name or pass -$Name."
  }
  return $Value
}

function Invoke-Probe {
  param(
    [Parameter(Mandatory=$true)][string]$Url,
    [hashtable]$Headers = @{}
  )

  try {
    $resp = Invoke-WebRequest -Uri $Url -Headers $Headers -Method GET -TimeoutSec 20 -ErrorAction Stop
    return [pscustomobject]@{
      Status = [int]$resp.StatusCode
      Body   = [string]$resp.Content
      Url    = $Url
    }
  }
  catch {
    $ex = $_.Exception
    $status = 0
    $body = if ($ex -and $ex.Message) { [string]$ex.Message } else { "Request failed" }
    $resp = $null

    if ($ex) {
      $p = $ex.PSObject.Properties.Match("Response")
      if (@($p).Count -gt 0) { $resp = $ex.Response }
    }

    if ($resp) {
      try { $status = [int]$resp.StatusCode } catch { $status = 0 }
      try {
        $stream = $resp.GetResponseStream()
        if ($stream) {
          $reader = New-Object System.IO.StreamReader($stream)
          $body = $reader.ReadToEnd()
          $reader.Dispose()
        }
      } catch { }
    }

    return [pscustomobject]@{
      Status = $status
      Body   = $body
      Url    = $Url
    }
  }
}

$BaseUrl = (Require-Value "OPS_BASE_URL" $BaseUrl).Trim().TrimEnd("/")
$ApiKey  = Require-Value "HOPE_API_KEY" $ApiKey

Write-Host ""
Write-Host "== Remote smoke ==" -ForegroundColor Cyan
Write-Host ("BaseUrl: {0}" -f $BaseUrl)
Write-Host ("ApiKey : len={0} last4={1}" -f $ApiKey.Length, ($ApiKey.Substring([Math]::Max(0,$ApiKey.Length-4))))

$headers = @{ "x-api-key" = $ApiKey }

$deadline = (Get-Date).AddSeconds(120)
$opsHealth = $null
$apiHealth = $null

while ((Get-Date) -lt $deadline) {
  $opsHealth = Invoke-Probe -Url "$BaseUrl/ops/health" -Headers $headers

  if ($opsHealth.Status -eq 200) {
    break
  }

  if ($opsHealth.Status -eq 404) {
    $apiHealth = Invoke-Probe -Url "$BaseUrl/api/health"
    if ($apiHealth.Status -eq 200) {
      break
    }
  }

  if ($opsHealth.Status -in @(401,403)) {
    throw ("Remote smoke auth failed against {0} (HTTP {1}). Check HOPE_API_KEY." -f $opsHealth.Url, $opsHealth.Status)
  }

  if ($apiHealth -and $apiHealth.Status -in @(401,403)) {
    throw ("Remote smoke auth failed against {0} (HTTP {1}). Check HOPE_API_KEY." -f $apiHealth.Url, $apiHealth.Status)
  }

  Write-Host ("Waiting for remote health... ops={0} api={1}" -f `
    ($(if ($opsHealth) { $opsHealth.Status } else { "n/a" })), `
    ($(if ($apiHealth) { $apiHealth.Status } else { "n/a" }))) -ForegroundColor DarkYellow
  Start-Sleep -Seconds 5
}

if ($opsHealth -and $opsHealth.Status -eq 200) {
  Write-Host ""
  Write-Host "OPS host detected via /ops/health" -ForegroundColor Green

  $smokePath = Join-Path $PSScriptRoot "smoke-tests.ps1"
  & pwsh -NoProfile -ExecutionPolicy Bypass -File $smokePath -BaseUrl $BaseUrl -ApiKey $ApiKey
  if ($LASTEXITCODE -ne 0) {
    throw "Remote smoke failed (exit=$LASTEXITCODE)."
  }

  Write-Host ""
  Write-Host "REMOTE SMOKE PASSED" -ForegroundColor Green
  exit 0
}

if ($opsHealth -and $opsHealth.Status -eq 404 -and $apiHealth -and $apiHealth.Status -eq 200) {
  if ($apiHealth.Status -eq 200) {
    Write-Host ""
    Write-Host "API-only Functions host detected via /api/health" -ForegroundColor Yellow

    $protectedOk = Invoke-Probe -Url "$BaseUrl/api/_protected/ping?limit=1" -Headers $headers
    if ($protectedOk.Status -ne 200) {
      throw "Expected 200 from /api/_protected/ping?limit=1 with valid x-api-key."
    }

    $protectedBad = Invoke-Probe -Url "$BaseUrl/api/_protected/ping?limit=abc" -Headers $headers
    if ($protectedBad.Status -ne 400) {
      throw "Expected 400 from /api/_protected/ping?limit=abc with valid x-api-key."
    }

    $protectedNoKey = Invoke-Probe -Url "$BaseUrl/api/_protected/ping?limit=1"
    if ($protectedNoKey.Status -ne 401) {
      throw "Expected 401 from /api/_protected/ping?limit=1 without x-api-key."
    }

    Write-Host ""
    Write-Host "REMOTE API SMOKE PASSED (ops surface not present on this host)" -ForegroundColor Green
    exit 0
  }
}

throw ("Unable to validate remote host after retries. /ops/health => {0}; /api/health => {1}" -f ($(if ($opsHealth) { $opsHealth.Status } else { "n/a" })), ($(if ($apiHealth) { $apiHealth.Status } else { "not checked" })))



