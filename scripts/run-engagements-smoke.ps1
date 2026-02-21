param(
  [string]$BaseUrl = "http://localhost:3000",
  [Parameter(Mandatory=$true)][string]$VisitorId,
  [int]$Port = 3000
)

$ErrorActionPreference = "Stop"

function Wait-HttpReady {
  param([string]$Url, [int]$TimeoutSeconds = 60)

  $sw = [Diagnostics.Stopwatch]::StartNew()
  while ($sw.Elapsed.TotalSeconds -lt $TimeoutSeconds) {
    try {
      Invoke-WebRequest -Uri $Url -Method GET -TimeoutSec 3 | Out-Null
      return
    } catch {
      Start-Sleep -Milliseconds 500
    }
  }
  throw "Server not ready after $TimeoutSeconds seconds at $Url"
}

Write-Host "==> npm ci"
npm ci

Write-Host "==> npm run build"
npm run build

Write-Host "==> Starting server on port $Port"
$env:PORT = "$Port"

# Keep visible for now so we can see startup errors
$server = Start-Process -FilePath "npm" -ArgumentList @("run","start:dist") -PassThru

try {
  $healthUrl = "$BaseUrl/ops/health"
Write-Host "==> Waiting for server readiness at $healthUrl"
  Wait-HttpReady -Url $healthUrl -TimeoutSeconds 60

  Write-Host "==> Running pagination smoke assertion"
  npm run test:smoke
  if ($LASTEXITCODE -ne 0) { throw "Smoke failed (exit=$LASTEXITCODE)" }
Write-Host "OK End-to-end build + server + smoke: SUCCESS"
}
finally {
  if ($server -and -not $server.HasExited) {
    Write-Host "==> Stopping server PID $($server.Id)"
    Stop-Process -Id $server.Id -Force
  }
}
