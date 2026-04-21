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
    name  = "Risk Assert"
    email = $email
  } | ConvertTo-Json)
}

function Post-Event($body) {
  Invoke-RestMethod -Method POST -Uri "$ApiBaseUrl/engagements/events" -Headers $headers -ContentType "application/json" -Body ($body | ConvertTo-Json -Depth 10) | Out-Null
}

Write-Host "=== ASSERT: Engagement risk ==="

# High-risk empty visitor
$empty = New-Visitor ("risk-empty+" + [guid]::NewGuid().ToString("N") + "@example.com")
$emptyVid = [string]$empty.visitorId

$r0 = Invoke-RestMethod -Method GET -Uri "$ApiBaseUrl/engagements/risk?visitorId=$emptyVid&windowDays=14" -Headers $headers
Assert-True ($r0.ok -eq $true) "empty risk expected ok=true"
Assert-True ([string]$r0.riskLevel -eq "high") "empty visitor should be high risk"
Assert-True ([int]$r0.riskScore -ge 60) "empty visitor should have high riskScore"

# Low-risk engaged visitor
$engaged = New-Visitor ("risk-engaged+" + [guid]::NewGuid().ToString("N") + "@example.com")
$vid = [string]$engaged.visitorId
$now = [DateTime]::UtcNow

Post-Event @{
  v = 1
  eventId = "evt-" + [guid]::NewGuid().ToString("N")
  visitorId = $vid
  type = "note.add"
  occurredAt = $now.AddMinutes(-5).ToString("o")
  source = @{ system = "assert-engagement-risk.ps1" }
  data = @{ text = "recent note" }
}

Post-Event @{
  v = 1
  eventId = "evt-" + [guid]::NewGuid().ToString("N")
  visitorId = $vid
  type = "status.transition"
  occurredAt = $now.AddMinutes(-4).ToString("o")
  source = @{ system = "assert-engagement-risk.ps1" }
  data = @{ from = "open"; to = "in_progress" }
}

Post-Event @{
  v = 1
  eventId = "evt-" + [guid]::NewGuid().ToString("N")
  visitorId = $vid
  type = "tag.add"
  occurredAt = $now.AddMinutes(-3).ToString("o")
  source = @{ system = "assert-engagement-risk.ps1" }
  data = @{ tag = "follow_up" }
}

$r1 = Invoke-RestMethod -Method GET -Uri "$ApiBaseUrl/engagements/risk?visitorId=$vid&windowDays=14" -Headers $headers
Assert-True ($r1.ok -eq $true) "engaged risk expected ok=true"
Assert-True ([string]$r1.riskLevel -eq "low") "recently engaged visitor should be low risk"
Assert-True ([int]$r1.engagement.score -ge 40) "engagement score should be present"

Write-Host "OK: engagement risk assert passed."
