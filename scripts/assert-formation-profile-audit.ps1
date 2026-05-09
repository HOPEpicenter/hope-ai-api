param(
  [Parameter(Mandatory=$true)][string]$BaseUrl,
  [Parameter(Mandatory=$true)][string]$ApiKey
)

$ErrorActionPreference = "Stop"

function PostJson($url, $headers, $body) {
  Invoke-RestMethod -Method Post -Uri $url -Headers $headers -ContentType "application/json" -Body ($body | ConvertTo-Json -Depth 20)
}

function GetJson($url, $headers) {
  Invoke-RestMethod -Method Get -Uri $url -Headers $headers
}

$headers = @{
  "x-api-key" = $ApiKey
}

$apiBase = $BaseUrl.TrimEnd("/") + "/api"
$opsBase = $BaseUrl.TrimEnd("/") + "/ops"

$email = "audit-smoke+" + [Guid]::NewGuid().ToString("N") + "@example.com"

$visitor = PostJson "$apiBase/visitors" $headers @{
  name  = "Formation Audit Smoke"
  email = $email
}

$visitorId = $visitor.visitorId

$base = (Get-Date).ToUniversalTime().AddMinutes(-10)

PostJson "$apiBase/formation/events" $headers @{
  v = 1
  eventId = "audit-assign-" + [Guid]::NewGuid().ToString("N")
  visitorId = $visitorId
  type = "FOLLOWUP_ASSIGNED"
  occurredAt = $base.ToString("o")
  source = @{
    system = "assert-formation-profile-audit"
  }
  data = @{
    assigneeId = "ops-user-1"
  }
} | Out-Null

PostJson "$apiBase/formation/events" $headers @{
  v = 1
  eventId = "audit-outcome-" + [Guid]::NewGuid().ToString("N")
  visitorId = $visitorId
  type = "FOLLOWUP_OUTCOME_RECORDED"
  occurredAt = $base.AddMinutes(1).ToString("o")
  source = @{
    system = "assert-formation-profile-audit"
  }
  data = @{
    outcome = "connected"
  }
} | Out-Null

$before = PostJson "$opsBase/formation/profile-audit" $headers @{
  visitorId = $visitorId
  repair = $false
}

if (-not $before.ok) {
  throw "Audit before repair was not ok"
}

if ($null -eq $before.drifted) {
  throw "Expected drifted flag before repair"
}

$repair = PostJson "$opsBase/formation/profile-audit" $headers @{
  visitorId = $visitorId
  repair = $true
}

if (-not $repair.ok) {
  throw "Audit repair response was not ok"
}

if ($repair.repair -ne $true) {
  throw "Expected repair=true echo"
}

if ($repair.drifted -ne $false) {
  throw "Expected no drift after repair"
}

if ($repair.expectedProfile.lastFollowupOutcome -ne "connected") {
  throw "Expected connected outcome after audit"
}

Write-Host "[assert-formation-profile-audit] OK" -ForegroundColor Green




