# scripts/verify-local-engagements.ps1
[CmdletBinding()]
param(
  # Root server URL (no /api). Example: http://localhost:3000
  [string]$BaseUrl = $(if ($env:HOPE_BASE_URL) { $env:HOPE_BASE_URL } else { "http://localhost:3000" }),

  # Stress seed size + paging limit
  [int]$StressTotal = 260,
  [int]$StressLimit = 200,

  # Smoke timeline limit
  [int]$SmokeTimelineLimit = 10
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

function Require-Env([string]$name) {
  $v = [Environment]::GetEnvironmentVariable($name)
  if ([string]::IsNullOrWhiteSpace($v)) { throw "Missing required env var: $name" }
  return $v
}

function Safe-Json([object]$o, [int]$depth = 10) {
  try { return ($o | ConvertTo-Json -Depth $depth -Compress) } catch { return "<json_failed>" }
}

function Invoke-HttpJson {
  param(
    [Parameter(Mandatory=$true)][ValidateSet("GET","POST")][string]$Method,
    [Parameter(Mandatory=$true)][string]$Uri,
    [Parameter(Mandatory=$true)][hashtable]$Headers,
    [object]$Body = $null
  )

  $json = $null
  if ($null -ne $Body) { $json = ($Body | ConvertTo-Json -Depth 20) }

  try {
    if ($Method -eq "GET") {
      return Invoke-RestMethod -Method Get -Uri $Uri -Headers $Headers
    } else {
      return Invoke-RestMethod -Method Post -Uri $Uri -Headers $Headers -ContentType "application/json" -Body $json
    }
  }
  catch {
    $msg = $_.Exception.Message
    throw "HTTP $Method $Uri failed: $msg`nBody=$json"
  }
}

function Assert-ApiReachableHttp([string]$baseUrl, [hashtable]$headers) {
  $baseUrl = $baseUrl.TrimEnd("/")
  $healthUrl = "$baseUrl/api/health"

  $maxAttempts = 8
  $delayMs = 500

  for ($i = 1; $i -le $maxAttempts; $i++) {
    try {
      $resp = Invoke-RestMethod -Method Get -Uri $healthUrl -Headers $headers
      if ($resp -and ($resp.PSObject.Properties.Name -contains "status") -and $resp.status -eq "ok") {
        Write-Host ("HTTP OK: {0}" -f $healthUrl)
        return
      }

      # If we got a response but it's not what we expect, still treat as reachable
      Write-Host ("HTTP reachable (unexpected payload): {0}" -f $healthUrl)
      return
    } catch {
      if ($i -eq $maxAttempts) {
        throw "API not reachable via HTTP at $healthUrl after $maxAttempts attempts. Last error: $($_.Exception.Message)"
      }
      Start-Sleep -Milliseconds $delayMs
    }
  }
}

function Run-Step([string]$label, [scriptblock]$fn) {
  Write-Host $label
  try {
    & $fn
    Write-Host "OK"
  } catch {
    Write-Host "FAIL" -ForegroundColor Red
    throw
  }
  Write-Host ""
}

# -------------------------
# Start
# -------------------------
$apiKey = Require-Env "HOPE_API_KEY"
if ($apiKey -match '^\s*<.*>\s*$' -or $apiKey -match 'your-api-key' -or $apiKey -match 'changeme' -or $apiKey -match 'replace') {
  throw "HOPE_API_KEY looks like a placeholder. Set a real key value and rerun."
}

$headers = @{ "x-api-key" = $apiKey }

$BaseUrl = $BaseUrl.TrimEnd("/")
$api = "$BaseUrl/api"

Write-Host "== verify-local-engagements =="

# 0) Fail fast if API isn't reachable
Assert-ApiReachableHttp $BaseUrl $headers

# 0b) Health check (use our wrapper so errors are consistent)
$h = Invoke-HttpJson -Method GET -Uri "$api/health" -Headers $headers
Write-Host ("Health  : " + (Safe-Json $h 6))
Write-Host ""

# 1) Stress: note mode
Run-Step ("[1/3] Stress timeline paging (Mode=note) total={0} limit={1}" -f $StressTotal, $StressLimit) {
  pwsh -NoProfile -ExecutionPolicy Bypass -File .\scripts\stress-engagement-events-paging.ps1 `
    -BaseUrl $BaseUrl `
    -Total $StressTotal `
    -Limit $StressLimit `
    -Mode note
}

# 2) Stress: status mode
Run-Step ("[2/3] Stress timeline paging (Mode=status) total={0} limit={1}" -f $StressTotal, $StressLimit) {
  pwsh -NoProfile -ExecutionPolicy Bypass -File .\scripts\stress-engagement-events-paging.ps1 `
    -BaseUrl $BaseUrl `
    -Total $StressTotal `
    -Limit $StressLimit `
    -Mode status
}

# 3) Smoke: visitor + engagements + timeline + analytics
Run-Step ("[3/3] Smoke visitor + engagements e2e (timelineLimit={0})" -f $SmokeTimelineLimit) {
  pwsh -NoProfile -ExecutionPolicy Bypass -File .\scripts\smoke-visitor-engagements-e2e.ps1 `
    -BaseUrl $BaseUrl `
    -TimelineLimit $SmokeTimelineLimit
}

Write-Host "PASS OK  All verification steps completed." -ForegroundColor Green
exit 0

