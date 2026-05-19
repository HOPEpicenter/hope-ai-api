param(
  [string]$ApiBase = "http://127.0.0.1:7071/api",
  [string]$ApiKey = $env:HOPE_API_KEY
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

function Json-Post {
  param(
    [string]$Url,
    [object]$Body
  )

  return Invoke-RestMethod `
    -Method Post `
    -Uri $Url `
    -Headers @{ "x-api-key" = $ApiKey } `
    -ContentType "application/json" `
    -Body ($Body | ConvertTo-Json -Depth 20)
}

function Assert {
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

Write-Host "=== ASSERT: Formation projection health repair contract ==="
Write-Host "ApiBase=$api"

$visitor = Json-Post `
  -Url "$api/visitors" `
  -Body @{
    name = "Projection Repair Contract"
    email = "projection-repair-contract@example.org"
  }

$visitorId = [string]$visitor.visitorId

Assert ($visitorId.Length -gt 0) "visitorId should exist"

$baseTime = (Get-Date).ToUniversalTime().AddMinutes(-10)

$events = @(
  @{
    type = "FOLLOWUP_OUTCOME_RECORDED"
    occurredAt = $baseTime.AddSeconds(50)
    data = @{ outcome = "connected" }
  },
  @{
    type = "FOLLOWUP_CONTACTED"
    occurredAt = $baseTime.AddSeconds(40)
    data = @{ method = "sms" }
  },
  @{
    type = "FOLLOWUP_ASSIGNED"
    occurredAt = $baseTime.AddSeconds(30)
    data = @{ assigneeId = "repair-contract-user" }
  }
)

foreach ($evt in $events) {
  Json-Post `
    -Url "$api/formation/events" `
    -Body @{
      v = 1
      eventId = "evt-repair-contract-$([guid]::NewGuid().ToString('N'))"
      visitorId = $visitorId
      type = $evt.type
      occurredAt = ([DateTime]$evt.occurredAt).ToString("o")
      source = @{
        system = "scripts/assert-formation-projection-health-repair-contract.ps1"
      }
      data = $evt.data
    } | Out-Null
}

$reportNoRepair = Json-Post `
  -Url "$api/_ops/formation/profile-audit" `
  -Body @{
    visitorId = $visitorId
    repair = $false
  }

Assert ($reportNoRepair.ok -eq $true) "repair=false report should succeed"
Assert ($reportNoRepair.repair -eq $false) "repair=false should echo false"

$reportRepair1 = Json-Post `
  -Url "$api/_ops/formation/profile-audit" `
  -Body @{
    visitorId = $visitorId
    repair = $true
  }

Assert ($reportRepair1.ok -eq $true) "repair=true report should succeed"
Assert ($reportRepair1.repair -eq $true) "repair=true should echo true"

$reportRepair2 = Json-Post `
  -Url "$api/_ops/formation/profile-audit" `
  -Body @{
    visitorId = $visitorId
    repair = $true
  }

Assert ($reportRepair2.ok -eq $true) "second repair=true should succeed"

$fields = @(
  "profileBehind",
  "latestEventAt",
  "profileLastEventAt",
  "drifted",
  "driftFields"
)

foreach ($field in $fields) {
  $v1 = $reportRepair1.$field | ConvertTo-Json -Compress
  $v2 = $reportRepair2.$field | ConvertTo-Json -Compress

  Assert ($v1 -eq $v2) "repair idempotency drift for '$field'"
}

$reportAfterRepair = Json-Post `
  -Url "$api/_ops/formation/profile-audit" `
  -Body @{
    visitorId = $visitorId
    repair = $false
  }

Assert ($reportAfterRepair.ok -eq $true) "repair=false after repair should succeed"
Assert ($reportAfterRepair.repair -eq $false) "repair=false after repair should echo false"
Assert (-not [bool]$reportAfterRepair.drifted) "repair=false after repair should remain not drifted"
Assert (-not [bool]$reportAfterRepair.profileBehind) "repair=false after repair should remain not profileBehind"
Assert (@($reportAfterRepair.driftFields).Count -eq 0) "repair=false after repair should have no driftFields"

$stableFields = @(
  "latestEventAt",
  "profileLastEventAt",
  "lagMs"
)

foreach ($field in $stableFields) {
  $v1 = $reportRepair2.$field | ConvertTo-Json -Compress
  $v2 = $reportAfterRepair.$field | ConvertTo-Json -Compress

  Assert ($v1 -eq $v2) "post-repair stability drift for '$field'"
}

Write-Host "OK: formation projection health repair contract assertion passed."
