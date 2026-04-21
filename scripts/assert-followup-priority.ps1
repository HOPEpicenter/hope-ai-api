param(
  [string]$ApiBaseUrl = "http://127.0.0.1:3000",
  [string]$ApiKey = ""
)

$ErrorActionPreference = "Stop"

if ($ApiBaseUrl -notlike "*/api") {
  $ApiBaseUrl = "$ApiBaseUrl/api"
}

if ([string]::IsNullOrWhiteSpace($ApiKey)) {
  $ApiKey = $env:HOPE_API_KEY
}

if ([string]::IsNullOrWhiteSpace($ApiKey)) {
  throw "HOPE_API_KEY is required"
}

$headers = @{ "x-api-key" = $ApiKey }

function Assert-True($cond, $msg) {
  if (-not $cond) { throw "ASSERT FAIL: $msg" }
}

function New-Visitor($email) {
  Invoke-RestMethod -Method POST -Uri "$ApiBaseUrl/visitors" -Headers $headers -ContentType "application/json" -Body (@{
    name  = "Priority Assert"
    email = $email
  } | ConvertTo-Json)
}

function Get-Card($visitorId) {
  Invoke-RestMethod -Method GET -Uri "$ApiBaseUrl/visitors/$visitorId/dashboard-card" -Headers $headers
}

Write-Host "=== ASSERT: Followup priority surface ==="

$high = New-Visitor ("priority-high+" + [guid]::NewGuid().ToString("N") + "@example.com")
$highCard = Get-Card ([string]$high.visitorId)

Assert-True ($highCard.card.priorityBand -in @("urgent","high","normal","low")) "high card should expose priorityBand"
Assert-True ($null -ne $highCard.card.priorityScore) "high card should expose priorityScore"
Assert-True ($null -ne $highCard.card.priorityReason) "high card should expose priorityReason"

Write-Host "OK: followup priority surface assert passed."
