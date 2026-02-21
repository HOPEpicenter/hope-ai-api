# scripts/run-dev.ps1
$ErrorActionPreference = "Stop"
$ProgressPreference = "SilentlyContinue"

# Keep dev consistent with scripts
$env:PORT = "3000"

# Expected local dev defaults (do not override if already set)
if (-not $env:HOPE_API_KEY) { $env:HOPE_API_KEY = "dev-local-key-123" }
if (-not $env:STORAGE_CONNECTION_STRING) { $env:STORAGE_CONNECTION_STRING = "UseDevelopmentStorage=true" }
if (-not $env:AzureWebJobsStorage) { $env:AzureWebJobsStorage = $env:STORAGE_CONNECTION_STRING }

# Require Azurite Tables
$az = Test-NetConnection 127.0.0.1 -Port 10002 -WarningAction SilentlyContinue
if (-not $az.TcpTestSucceeded) {
  throw "Azurite Table service is not reachable at 127.0.0.1:10002. Start Azurite (Tables) then re-run."
}

Write-Host "[run-dev] PORT=$env:PORT"
Write-Host "[run-dev] STORAGE_CONNECTION_STRING=$env:STORAGE_CONNECTION_STRING"
npm run dev

