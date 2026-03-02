# scripts/assert-formation-snapshot-invariants.ps1
# Verifies FormationProfile snapshot invariants:
# - idempotency by eventId
# - out-of-order event tolerance
# - deterministic lastEventAt/lastEventType by canonical (occurredAt,eventId) ordering

param(
  [Parameter(Mandatory=$true)][string]$BaseUrl,
  [string]$ApiKey
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

function Assert-True {
  param([Parameter(Mandatory=$true)][bool]$Condition, [Parameter(Mandatory=$true)][string]$Message)
  if (-not $Condition) { throw "ASSERT FAILED: $Message" }
}

function Json-Post {
  param([Parameter(Mandatory=$true)][string]$Url, [Parameter(Mandatory=$true)][object]$Body, [hashtable]$Headers)
  $json = ($Body | ConvertTo-Json -Depth 30 -Compress)
  return Invoke-RestMethod -Method Post -Uri $Url -Headers $Headers -ContentType "application/json" -Body $json
}

function Json-Get {
  param([Parameter(Mandatory=$true)][string]$Url, [hashtable]$Headers)
  return Invoke-RestMethod -Method Get -Uri $Url -Headers $Headers
}

$ApiBase = ($BaseUrl.TrimEnd("/") + "/api")
$headers = @{}
if ($ApiKey) { $headers["x-api-key"] = $ApiKey }

Write-Host ("[assert-formation-snapshot] ApiBase={0}" -f $ApiBase)

# 1) Create visitor
$create = Json-Post -Url "$ApiBase/visitors" -Body @{
  name  = "formation-snapshot-smoke"
  email = ("formation+" + [Guid]::NewGuid().ToString("N") + "@example.com")
} -Headers $headers

$visitorId = [string]$create.visitorId
Assert-True ($visitorId.Trim().Length -gt 0) "visitorId should be returned"
Write-Host "[assert-formation-snapshot] visitorId=$visitorId"

# 2) Explicit timestamps (older -> newer)
$t0 = (Get-Date).ToUniversalTime().AddMinutes(-10).ToString("o")
$t1 = (Get-Date).ToUniversalTime().AddMinutes(-5).ToString("o")
$t2 = (Get-Date).ToUniversalTime().AddMinutes(-1).ToString("o")

$evtA = "evt-formation-a-" + [Guid]::NewGuid().ToString("N")
$evtB = "evt-formation-b-" + [Guid]::NewGuid().ToString("N")
$evtC = "evt-formation-c-" + [Guid]::NewGuid().ToString("N")

function Post-FormationEventV1 {
  param(
    [Parameter(Mandatory=$true)][string]$EventId,
    [Parameter(Mandatory=$true)][string]$Type,
    [Parameter(Mandatory=$true)][string]$OccurredAt,
    [hashtable]$Data
  )

  $body = @{
    v          = 1
    eventId    = $EventId
    visitorId  = $visitorId
    type       = $Type
    occurredAt = $OccurredAt
    source     = @{ system = "assert-formation-snapshot-invariants" }
    data       = ($Data ?? @{})
  }

  $r = Json-Post -Url "$ApiBase/formation/events" -Body $body -Headers $headers
  Assert-True ([bool]$r.ok) "formation event post should return ok=true"
  return $r
}

function Get-FormationProfile {
  $p = Json-Get -Url "$ApiBase/visitors/$visitorId/formation/profile" -Headers $headers
  Assert-True ([bool]$p.ok) "profile get should return ok=true"
  return $p.profile
}

# 3) In-order: A then B
Post-FormationEventV1 -EventId $evtA -Type "FOLLOWUP_ASSIGNED" -OccurredAt $t1 -Data @{ assigneeId = "ops-smoke" } | Out-Null
Post-FormationEventV1 -EventId $evtB -Type "FOLLOWUP_OUTCOME_RECORDED" -OccurredAt $t2 -Data @{ outcome = "reached" } | Out-Null

$profile1 = Get-FormationProfile
Assert-True ($null -ne $profile1) "profile should exist after events"

# Compare instants: Invoke-RestMethod may materialize ISO strings as DateTime
function To-UtcDto {
  param([Parameter(Mandatory=$true)]$Value)
  if ($Value -is [DateTimeOffset]) { return $Value.ToUniversalTime() }
  if ($Value -is [DateTime]) { return ([DateTimeOffset]$Value).ToUniversalTime() }
  return [DateTimeOffset]::Parse([string]$Value).ToUniversalTime()
}

# 4) Retry A (idempotency)
Post-FormationEventV1 -EventId $evtA -Type "FOLLOWUP_ASSIGNED" -OccurredAt $t1 -Data @{ assigneeId = "ops-smoke" } | Out-Null
$profile1b = Get-FormationProfile

Assert-True ((To-UtcDto $profile1.lastEventAt).UtcDateTime -eq (To-UtcDto $profile1b.lastEventAt).UtcDateTime) "lastEventAt should be unchanged on retry"
Assert-True ($profile1.lastEventType -eq $profile1b.lastEventType) "lastEventType should be unchanged on retry"

# 5) Out-of-order older event C (late arrival)
Post-FormationEventV1 -EventId $evtC -Type "FOLLOWUP_CONTACTED" -OccurredAt $t0 -Data @{ method = "sms"; result = "reached" } | Out-Null
$profile2 = Get-FormationProfile

# lastEventAt/Type should remain at B (t2)
Assert-True ((To-UtcDto $profile2.lastEventAt).UtcDateTime -eq (To-UtcDto $t2).UtcDateTime) "lastEventAt should remain newest occurredAt (t2) even after older event arrives"
Assert-True ($profile2.lastEventType -eq "FOLLOWUP_OUTCOME_RECORDED") "lastEventType should remain newest event type (B)"

# Touchpoint for contacted should reflect C (t0), if present
if ($profile2.PSObject.Properties.Name -contains "lastFollowupContactedAt") {
  Assert-True ((To-UtcDto $profile2.lastFollowupContactedAt).UtcDateTime -eq (To-UtcDto $t0).UtcDateTime) "lastFollowupContactedAt should reflect out-of-order older event"
}

Write-Host "[assert-formation-snapshot] OK: formation snapshot invariants passed." -ForegroundColor Green
