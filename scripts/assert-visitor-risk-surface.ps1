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
    name  = "Visitor Risk Surface Assert"
    email = $email
  } | ConvertTo-Json)
}

function Post-Event($body) {
  Invoke-RestMethod -Method POST -Uri "$ApiBaseUrl/engagements/events" -Headers $headers -ContentType "application/json" -Body ($body | ConvertTo-Json -Depth 10) | Out-Null
}

Write-Host "=== ASSERT: Visitor summary + dashboard expose risk ==="

$created = New-Visitor ("visitor-risk+" + [guid]::NewGuid().ToString("N") + "@example.com")
$visitorId = [string]$created.visitorId
$now = [DateTime]::UtcNow

Post-Event @{
  v = 1
  eventId = "evt-" + [guid]::NewGuid().ToString("N")
  visitorId = $visitorId
  type = "note.add"
  occurredAt = $now.AddMinutes(-5).ToString("o")
  source = @{ system = "assert-visitor-risk-surface.ps1" }
  data = @{ text = "recent note" }
}

Post-Event @{
  v = 1
  eventId = "evt-" + [guid]::NewGuid().ToString("N")
  visitorId = $visitorId
  type = "status.transition"
  occurredAt = $now.AddMinutes(-4).ToString("o")
  source = @{ system = "assert-visitor-risk-surface.ps1" }
  data = @{ from = "open"; to = "in_progress" }
}

$summary = Invoke-RestMethod -Method GET -Uri "$ApiBaseUrl/visitors/$visitorId/summary" -Headers $headers
Assert-True ($summary.ok -eq $true) "summary should return ok=true"
Assert-True ($null -ne $summary.summary.engagement.risk) "summary should include engagement.risk"
Assert-True ([string]$summary.summary.engagement.risk.riskLevel -in @("low","medium","high")) "summary riskLevel should be present"

$card = Invoke-RestMethod -Method GET -Uri "$ApiBaseUrl/visitors/$visitorId/dashboard-card" -Headers $headers
Assert-True ($null -ne $card.card) "dashboard card should exist"
Assert-True ([string]$card.card.riskLevel -in @("low","medium","high")) "dashboard card riskLevel should be present"
Assert-True ($null -ne $card.card.riskScore) "dashboard card riskScore should be present"

Write-Host "OK: visitor risk surface assert passed."
