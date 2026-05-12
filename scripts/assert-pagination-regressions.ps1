param(
  [string]$RootUrl = "http://127.0.0.1:7071",
  [string]$ApiKey = $env:HOPE_API_KEY,
  [switch]$Deep,
  [switch]$Stress
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

function Normalize-RootUrl([string]$u) {
  if ([string]::IsNullOrWhiteSpace($u)) { throw "RootUrl is required." }
  $u = $u.Trim().TrimEnd("/")
  if ($u -match "/api$") {
    $u = $u.Substring(0, $u.Length - 4)
  }
  return $u
}

function Invoke-Step {
  param(
    [string]$Name,
    [scriptblock]$Command
  )

  Write-Host ""
  Write-Host "==> $Name" -ForegroundColor Cyan

  & $Command
  $exit = $LASTEXITCODE

  if ($exit -ne 0) {
    throw "$Name failed with exit code $exit"
  }

  Write-Host "OK: $Name" -ForegroundColor Green
}

if ([string]::IsNullOrWhiteSpace($ApiKey)) {
  throw "HOPE_API_KEY is required."
}

if ($ApiKey.ToLowerInvariant().Contains("placeholder") -or $ApiKey.Contains("<")) {
  throw "HOPE_API_KEY looks like a placeholder. Set a real key value and rerun."
}

$root = Normalize-RootUrl $RootUrl
$api = "$root/api"

Write-Host "== assert-pagination-regressions =="
Write-Host "RootUrl=$root"
Write-Host "ApiBase=$api"
Write-Host "Deep=$Deep Stress=$Stress"

$env:HOPE_API_KEY = $ApiKey
$env:HOPE_RUN_PHASE3_ASSERTS = "1"

Invoke-Step "formation pagination" {
  $env:HOPE_RUN_PHASE3_DEEP_PAGING = "1"

  pwsh -NoProfile -ExecutionPolicy Bypass -File "$PSScriptRoot/assert-formation-pagination.ps1" `
    -ApiBase $api
}

Invoke-Step "integration cross-stream cursor boundary" {
  pwsh -NoProfile -ExecutionPolicy Bypass -File "$PSScriptRoot/assert-integration-cross-stream-cursor-boundary.ps1" `
    -BaseUrl $api `
    -ApiKey $ApiKey
}

Invoke-Step "integration paging ties" {
  pwsh -NoProfile -ExecutionPolicy Bypass -File "$PSScriptRoot/assert-integration-paging-ties.ps1" `
    -ApiBaseUrl $api `
    -ApiKey $ApiKey
}
Invoke-Step "ops followups lifecycle and pagination" {
  pwsh -NoProfile -ExecutionPolicy Bypass -File "$PSScriptRoot/assert-ops-followups.ps1" `
    -ApiBase $api `
    -OpsBase "$api/ops" `
    -ApiKey $ApiKey
}


if ($Stress) {
  Invoke-Step "engagement events paging stress" {
    pwsh -NoProfile -ExecutionPolicy Bypass -File "$PSScriptRoot/stress-engagement-events-paging.ps1" `
      -BaseUrl $api `
      -ApiKey $ApiKey
  }

  Invoke-Step "integration timeline paging stress" {
    pwsh -NoProfile -ExecutionPolicy Bypass -File "$PSScriptRoot/stress-integration-timeline-paging.ps1" `
      -ApiBaseUrl $api `
      -ApiKey $ApiKey
  }
}

Write-Host ""
Write-Host "OK: pagination regression gate passed." -ForegroundColor Green





