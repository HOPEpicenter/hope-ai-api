param(
  [string]$ApiKey = "dev-local-key-123",
  [string]$StorageConnectionString = "UseDevelopmentStorage=true",
  [int]$Port = 3000
)

$ErrorActionPreference = "Stop"

function Stop-Port([int]$p) {
  $pids = (Get-NetTCPConnection -State Listen -LocalPort $p -ErrorAction SilentlyContinue).OwningProcess |
    Sort-Object -Unique
  foreach ($pid in $pids) {
    Stop-Process -Id $pid -Force -ErrorAction SilentlyContinue
  }
}

Stop-Port $Port

$env:HOPE_API_KEY = $ApiKey
$env:STORAGE_CONNECTION_STRING = $StorageConnectionString

Write-Host ("OK: HOPE_API_KEY={0}" -f $env:HOPE_API_KEY)
Write-Host ("OK: STORAGE_CONNECTION_STRING={0}" -f $env:STORAGE_CONNECTION_STRING)
Write-Host ("OK: running CI smoke on port {0} ..." -f $Port)

& "$PSScriptRoot\ci-run-express-smoke.ps1"
