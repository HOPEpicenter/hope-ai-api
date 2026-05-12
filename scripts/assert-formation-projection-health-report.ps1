param(
  [string]$ApiBase = "http://127.0.0.1:7071/api",
  [string]$ApiKey = $env:HOPE_API_KEY
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

function Invoke-Json {
  param(
    [string]$Method,
    [string]$Uri,
    [object]$Body = $null
  )

  $headers = @{
    "x-api-key" = $ApiKey
  }

  if ($null -eq $Body) {
    return Invoke-RestMethod -Method $Method -Uri $Uri -Headers $headers
  }

  return Invoke-RestMethod -Method $Method -Uri $Uri -Headers $headers -ContentType "application/json" -Body ($Body | ConvertTo-Json -Depth 20)
}

function Assert-True {
  param(
    [bool]$Condition,
    [string]$Message
  )

  if (-not $Condition) {
    throw "ASSERT FAILED: $Message"
  }
}

if ([string]::IsNullOrWhiteSpace($ApiKey)) {
  throw "ApiKey is required."
}

$api = $ApiBase.Trim().TrimEnd("/")

Write-Host "=== ASSERT: Formation projection health report contract ==="
Write-Host "ApiBase=$api"

$visitor = Invoke-Json -Method "Post" -Uri "$api/visitors" -Body @{
  name = "Projection Health Report Assert"
  email = "projection-health-report-assert@example.org"
}

$visitorId = [string]$visitor.visitorId
Assert-True ($visitorId.Length -gt 0) "visitorId should be returned"

$occurredAt = (Get-Date).ToUniversalTime().ToString("o")

$null = Invoke-Json -Method "Post" -Uri "$api/formation/events" -Body @{
  visitorId = $visitorId
  v = 1
  eventId = "evt-projection-health-report-$([guid]::NewGuid().ToString('N'))"
  type = "FOLLOWUP_ASSIGNED"
  occurredAt = $occurredAt
  source = @{
    system = "scripts/assert-formation-projection-health-report.ps1"
  }
  data = @{
    assigneeId = "projection-health-report-assert"
    priority = "high"
  }
}

$report = Invoke-Json -Method "Post" -Uri "$api/_ops/formation/profile-audit" -Body @{
  visitorId = $visitorId
  repair = $false
}

Assert-True ($report.ok -eq $true) "report should return ok=true"
Assert-True ($report.visitorId -eq $visitorId) "report should echo visitorId"
Assert-True ($null -ne $report.PSObject.Properties["profileBehind"]) "report should expose profileBehind"
Assert-True ($null -ne $report.PSObject.Properties["lagMs"]) "report should expose lagMs"
Assert-True ($null -ne $report.PSObject.Properties["latestEventAt"]) "report should expose latestEventAt"
Assert-True ($null -ne $report.PSObject.Properties["profileLastEventAt"]) "report should expose profileLastEventAt"
Assert-True ($null -ne $report.PSObject.Properties["driftFields"]) "report should expose driftFields"
Assert-True ($null -ne $report.PSObject.Properties["currentProfile"]) "report should expose currentProfile"
Assert-True ($null -ne $report.PSObject.Properties["expectedProfile"]) "report should expose expectedProfile"
Assert-True ($report.repair -eq $false) "report should not repair by default"
Assert-True ($null -ne $report.PSObject.Properties["drifted"]) "report should expose drifted"

Write-Host "OK: formation projection health report contract assertion passed."



