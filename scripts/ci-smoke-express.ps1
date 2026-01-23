param(
  [string]$BaseUrl = "http://127.0.0.1:3000/api",
  [int]$RetrySeconds = 60
)

$ErrorActionPreference = "Stop"

if (-not $env:HOPE_API_KEY) {
  throw "HOPE_API_KEY env var is missing. CI must set secrets.HOPE_API_KEY"
}

$headers = @{ "x-api-key" = $env:HOPE_API_KEY }

function Assert([bool]$cond, [string]$msg) {
  if (-not $cond) { throw $msg }
}

function Dump-ExpressLogs {
  Write-Host "==== EXPRESS OUT (tail 200) ====" -ForegroundColor Yellow
  if ($env:EXPRESS_OUT_LOG -and (Test-Path $env:EXPRESS_OUT_LOG)) {
    Get-Content $env:EXPRESS_OUT_LOG -Tail 200 | ForEach-Object { Write-Host $_ }
  } else {
    Write-Host "(missing EXPRESS_OUT_LOG or file not found: $($env:EXPRESS_OUT_LOG))"
  }

  Write-Host "==== EXPRESS ERR (tail 200) ====" -ForegroundColor Yellow
  if ($env:EXPRESS_ERR_LOG -and (Test-Path $env:EXPRESS_ERR_LOG)) {
    Get-Content $env:EXPRESS_ERR_LOG -Tail 200 | ForEach-Object { Write-Host $_ }
  } else {
    Write-Host "(missing EXPRESS_ERR_LOG or file not found: $($env:EXPRESS_ERR_LOG))"
  }
}

Write-Host "=== CI EXPRESS SMOKE ==="
Write-Host "BaseUrl: $BaseUrl"

# POST /visitors (retry loop)
$stamp = Get-Date -Format "yyyyMMddHHmmss"
$body = @{
  firstName = "CI"
  lastName  = "Smoke"
  email     = "ci-smoke+$stamp@example.com"
  phone     = "555-0000"
  source    = "ci"
} | ConvertTo-Json

Write-Host "POST $BaseUrl/visitors"

$deadline = (Get-Date).AddSeconds($RetrySeconds)
$created = $null
$lastErr = $null

do {
  try {
    $created = Invoke-RestMethod -Method Post -Uri "$BaseUrl/visitors" -Headers $headers -ContentType "application/json" -Body $body -TimeoutSec 10
    break
  } catch {
    $lastErr = $_
    Start-Sleep -Milliseconds 500
  }
} while ((Get-Date) -lt $deadline)

if (-not $created) {
  Write-Host "FAILED: Could not POST /visitors within $RetrySeconds seconds." -ForegroundColor Red
  Dump-ExpressLogs
  throw $lastErr
}

Assert (-not [string]::IsNullOrWhiteSpace($created.id)) "POST /visitors did not return 'id'. Response: $(($created | ConvertTo-Json -Depth 10))"
$vid = $created.id
Write-Host "CREATED ID: $vid"

# GET /visitors/{id}
Write-Host "GET $BaseUrl/visitors/$vid"
$got = Invoke-RestMethod -Method Get -Uri "$BaseUrl/visitors/$vid" -Headers $headers -TimeoutSec 10
Assert ($got.id -eq $vid) "GET /visitors/{id} returned wrong id. Response: $(($got | ConvertTo-Json -Depth 10))"

# LIST /visitors?limit=5
Write-Host "LIST $BaseUrl/visitors?limit=5"
$list = Invoke-RestMethod -Method Get -Uri "$BaseUrl/visitors?limit=5" -Headers $headers -TimeoutSec 10
Assert ($list.ok -eq $true) "LIST /visitors did not return ok=true. Response: $(($list | ConvertTo-Json -Depth 10))"
Assert ($list.items.Count -ge 1) "LIST /visitors returned no items. Response: $(($list | ConvertTo-Json -Depth 10))"

Write-Host "OK: CI Express smoke passed."
