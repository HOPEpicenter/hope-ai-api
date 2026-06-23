# scripts/measure-ops-preview-latency.ps1
# Diagnostic-only helper for measuring OPS task preview endpoint latency.
# Does not create tasks, persist tasks, activate orchestration, or mutate backend state.
# PowerShell 7+.

[CmdletBinding()]
param(
  [Parameter(Mandatory=$false)]
  [string]$BaseUrl,

  [Parameter(Mandatory=$false)]
  [string]$ApiBase,

  [Parameter(Mandatory=$false)]
  [string]$ApiKey,

  [Parameter(Mandatory=$false)]
  [int]$Repetitions = 3,

  [Parameter(Mandatory=$false)]
  [int]$TimeoutSeconds = 60,

  [Parameter(Mandatory=$false)]
  [int]$WarnThresholdMs = 15000
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"
$ProgressPreference = "SilentlyContinue"

function Normalize-Base([string]$Value) {
  if ([string]::IsNullOrWhiteSpace($Value)) {
    return ""
  }

  return $Value.Trim().TrimEnd("/")
}

function Require-ApiKey([string]$Value) {
  if ([string]::IsNullOrWhiteSpace($Value)) {
    throw "HOPE_API_KEY is required. Set env:HOPE_API_KEY or pass -ApiKey."
  }

  return $Value
}

function Invoke-PreviewProbe {
  param(
    [Parameter(Mandatory=$true)]
    [string]$Name,

    [Parameter(Mandatory=$true)]
    [string]$Url,

    [Parameter(Mandatory=$true)]
    [hashtable]$Headers,

    [Parameter(Mandatory=$true)]
    [int]$TimeoutSeconds
  )

  $sw = [System.Diagnostics.Stopwatch]::StartNew()
  $statusCode = 0
  $ok = $false
  $errorText = $null
  $body = $null

  try {
    $response = Invoke-WebRequest `
      -Method Get `
      -Uri $Url `
      -Headers $Headers `
      -TimeoutSec $TimeoutSeconds `
      -UseBasicParsing

    $statusCode = [int]$response.StatusCode

    if (-not [string]::IsNullOrWhiteSpace([string]$response.Content)) {
      $body = $response.Content | ConvertFrom-Json
      $ok = ($body.ok -eq $true)
    }
  } catch {
    $errorText = $_.Exception.Message

    try {
      $statusCode = [int]$_.Exception.Response.StatusCode
    } catch {
      $statusCode = 0
    }
  } finally {
    $sw.Stop()
  }

  [pscustomobject]@{
    name = $Name
    url = $Url
    statusCode = $statusCode
    ok = $ok
    elapsedMs = [int][Math]::Round($sw.Elapsed.TotalMilliseconds)
    error = $errorText
  }
}

$BaseUrl = Normalize-Base $BaseUrl
$ApiBase = Normalize-Base $ApiBase

if (-not $ApiBase) {
  if (-not $BaseUrl) {
    throw "Provide -BaseUrl or -ApiBase."
  }

  if ($BaseUrl.ToLowerInvariant().EndsWith("/api")) {
    $ApiBase = $BaseUrl
  } else {
    $ApiBase = "$BaseUrl/api"
  }
}

if ([string]::IsNullOrWhiteSpace($ApiKey)) {
  $ApiKey = (Get-Item ("env:" + "HOPE_API_KEY") -ErrorAction SilentlyContinue).Value
}
$ApiKey = Require-ApiKey $ApiKey

if ($Repetitions -lt 1) {
  throw "-Repetitions must be at least 1."
}

if ($TimeoutSeconds -lt 1) {
  throw "-TimeoutSeconds must be at least 1."
}

$headers = @{ "x-api-key" = $ApiKey }

$targets = @(
  @{
    name = "task-preview-summary"
    url = "$ApiBase/ops/task-preview-summary?limit=10&includeResolved=true"
  },
  @{
    name = "task-preview-simulation"
    url = "$ApiBase/ops/task-preview-simulation?limit=10&includeResolved=true"
  }
)

Write-Host ("[measure-ops-preview-latency] ApiBase={0}" -f $ApiBase)
Write-Host ("[measure-ops-preview-latency] Repetitions={0} TimeoutSeconds={1} WarnThresholdMs={2}" -f $Repetitions, $TimeoutSeconds, $WarnThresholdMs)

$results = New-Object System.Collections.Generic.List[object]

for ($i = 1; $i -le $Repetitions; $i++) {
  foreach ($target in $targets) {
    $result = Invoke-PreviewProbe `
      -Name ([string]$target.name) `
      -Url ([string]$target.url) `
      -Headers $headers `
      -TimeoutSeconds $TimeoutSeconds

    $result | Add-Member -NotePropertyName repetition -NotePropertyValue $i
    $result | Add-Member -NotePropertyName warned -NotePropertyValue ([int]$result.elapsedMs -ge $WarnThresholdMs)

    $results.Add($result)

    $status = if ($result.ok -ne $true) { "FAIL" } elseif ($result.warned) { "WARN" } else { "OK" }
    Write-Host ("[{0}] {1} repetition={2} statusCode={3} ok={4} elapsedMs={5}" -f $status, $result.name, $i, $result.statusCode, $result.ok, $result.elapsedMs)
  }
}

$summary =
  $results |
  Group-Object name |
  ForEach-Object {
    $items = @($_.Group)
    $elapsed = @($items | ForEach-Object { [int]$_.elapsedMs } | Sort-Object)
    $count = $elapsed.Count
    $avg = if ($count -gt 0) { [int][Math]::Round(($elapsed | Measure-Object -Average).Average) } else { 0 }
    $max = if ($count -gt 0) { [int]($elapsed | Select-Object -Last 1) } else { 0 }
    $min = if ($count -gt 0) { [int]($elapsed | Select-Object -First 1) } else { 0 }
    $failed = @($items | Where-Object { $_.ok -ne $true }).Count
    $warned = @($items | Where-Object { $_.warned -eq $true }).Count

    [pscustomobject]@{
      name = $_.Name
      count = $count
      minMs = $min
      avgMs = $avg
      maxMs = $max
      failed = $failed
      warned = $warned
    }
  }

Write-Host ""
Write-Host "[measure-ops-preview-latency] Summary"
$summary | Format-Table -AutoSize

$failures = @($results | Where-Object { $_.ok -ne $true })

if ($failures.Count -gt 0) {
  Write-Host ""
  Write-Host "[measure-ops-preview-latency] Failures"
  $failures | Format-Table -AutoSize
  throw "One or more ops preview latency probes failed."
}

Write-Host "[measure-ops-preview-latency] OK: diagnostic latency probe completed." -ForegroundColor Green
