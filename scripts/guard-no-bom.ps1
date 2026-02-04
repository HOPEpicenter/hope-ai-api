# scripts/guard-no-bom.ps1
Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$ScriptDir = $PSScriptRoot
if (-not $ScriptDir -or $ScriptDir.Trim().Length -eq 0) { $ScriptDir = (Get-Location).Path }

$maybePkg1 = Join-Path $ScriptDir "package.json"
$maybePkg2 = Join-Path (Split-Path $ScriptDir -Parent) "package.json"

if (Test-Path $maybePkg1) { $path = $maybePkg1 }
elseif (Test-Path $maybePkg2) { $path = $maybePkg2 }
else { throw "Could not find package.json from: $ScriptDir" }

$bytes = [System.IO.File]::ReadAllBytes((Resolve-Path $path))
if ($bytes.Length -ge 3 -and $bytes[0] -eq 0xEF -and $bytes[1] -eq 0xBB -and $bytes[2] -eq 0xBF) {
  throw "package.json has a UTF-8 BOM. Re-save as UTF-8 without BOM."
}

Write-Host "No BOM detected in package.json" -ForegroundColor Green
