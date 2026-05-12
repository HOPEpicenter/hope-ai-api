$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

Write-Host "=== ASSERT: Regression target normalization ==="

$script = Join-Path $PSScriptRoot "assert-pagination-regressions.ps1"

$env:HOPE_API_KEY = "test-key-for-normalization-assert"

$output = & pwsh -NoProfile -ExecutionPolicy Bypass -File $script `
  -RootUrl "http://127.0.0.1:7071" `
  -ApiBase "https://hope-ai-api-staging.azurewebsites.net/api" `
  -ApiKey $env:HOPE_API_KEY 2>&1

$exit = $LASTEXITCODE

if ($exit -eq 0) {
  throw "Expected mismatched RootUrl and ApiBase to fail."
}

$text = $output -join "`n"

if ($text -notmatch "RootUrl and ApiBase target different hosts") {
  Write-Host $text
  throw "Expected mismatch failure message was not found."
}

Write-Host "OK: mismatched RootUrl and ApiBase are rejected."
exit 0
