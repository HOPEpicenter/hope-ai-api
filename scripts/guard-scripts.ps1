# scripts/guard-scripts.ps1
Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$opsPath = Join-Path $PSScriptRoot "ops.ps1"

if (-not (Test-Path -LiteralPath $opsPath)) {
  throw "Guard failed: missing scripts/ops.ps1"
}

$ops = Get-Content -LiteralPath $opsPath -Raw

# A) Header exactly once
$headers = [regex]::Matches($ops, '(?m)^\s*#\s*scripts/ops\.ps1\s*$').Count
if ($headers -ne 1) {
  throw "Guard failed: scripts/ops.ps1 expected 1 header, found $headers."
}

# B) OpsRequest exactly once
$reqCount = [regex]::Matches($ops, '(?m)^\s*function\s+OpsRequest\s*\{').Count
if ($reqCount -ne 1) {
  throw "Guard failed: expected exactly 1 OpsRequest, found $reqCount."
}

# C) PS 5.1 body-capture logic present
if ($ops -notmatch '\$_\.ErrorDetails\s*-and\s*\$_\.ErrorDetails\.Message') {
  throw "Guard failed: missing PS5.1 ErrorDetails.Message capture logic."
}

# D) Parse / dot-source safety
try { . $opsPath | Out-Null }
catch { throw "Guard failed: ops.ps1 does not parse: $($_.Exception.Message)" }

Write-Host "OK: guard-scripts passed." -ForegroundColor Green
