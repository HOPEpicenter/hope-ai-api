$ErrorActionPreference = "Stop"

$sourceRoot = Join-Path $PSScriptRoot "..\src\functions"
$repoRoot = Join-Path $PSScriptRoot ".."

Get-ChildItem -Path $sourceRoot -Directory | ForEach-Object {
  $functionName = $_.Name
  $sourceFile = Join-Path $_.FullName "function.json"
  if (-not (Test-Path $sourceFile)) {
    return
  }

  $targetDir = Join-Path $repoRoot $functionName
  $targetFile = Join-Path $targetDir "function.json"

  if (-not (Test-Path $targetDir)) {
    New-Item -ItemType Directory -Path $targetDir -Force | Out-Null
  }

  Copy-Item -Path $sourceFile -Destination $targetFile -Force
}

Write-Host "Copied Azure Functions function.json files to repo root."
