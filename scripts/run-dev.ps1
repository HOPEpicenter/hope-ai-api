# scripts/run-dev.ps1
$ErrorActionPreference = "Stop"
$ProgressPreference = "SilentlyContinue"

# Keep dev consistent with scripts
$env:PORT = "3000"

if ([string]::IsNullOrWhiteSpace($env:HOPE_API_KEY)) {
  throw "HOPE_API_KEY is not set. Set `$env:HOPE_API_KEY before running local dev."
}

if (-not $env:STORAGE_CONNECTION_STRING) { $env:STORAGE_CONNECTION_STRING = "UseDevelopmentStorage=true" }
if (-not $env:AzureWebJobsStorage) { $env:AzureWebJobsStorage = $env:STORAGE_CONNECTION_STRING }

# Require Azurite Tables
$az = Test-NetConnection 127.0.0.1 -Port 10002 -WarningAction SilentlyContinue
if (-not $az.TcpTestSucceeded) {
  throw "Azurite Table service is not reachable at 127.0.0.1:10002. Start Azurite (Tables) then re-run."
}

$keySuffix = if ($env:HOPE_API_KEY.Length -ge 4) {
  $env:HOPE_API_KEY.Substring($env:HOPE_API_KEY.Length - 4)
} else {
  $env:HOPE_API_KEY
}

Write-Host "[run-dev] PORT=$env:PORT"
Write-Host "[run-dev] STORAGE_CONNECTION_STRING=$env:STORAGE_CONNECTION_STRING"
Write-Host "[run-dev] HOPE_API_KEY=****$keySuffix"
npm run dev
