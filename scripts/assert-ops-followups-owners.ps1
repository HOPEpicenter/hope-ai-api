param(
  [string]$Base = "http://127.0.0.1:3000"
)

$ErrorActionPreference = "Stop"

function Require-Env([string]$name) {
  $v = [Environment]::GetEnvironmentVariable($name)
  if ([string]::IsNullOrWhiteSpace($v)) {
    throw "Missing required env var: $name"
  }
  return $v
}

function New-SafeEmail([string]$prefix) {
  $safePrefix = ($prefix.ToLowerInvariant() -replace '[^a-z0-9]+', '-').Trim('-')
  if ([string]::IsNullOrWhiteSpace($safePrefix)) {
    $safePrefix = "visitor"
  }

  $stamp = (Get-Date).ToUniversalTime().ToString("yyyyMMddHHmmssfff")
  return ("{0}-{1}@example.com" -f $safePrefix, $stamp)
}

$apiKey = Require-Env "HOPE_API_KEY"
$headers = @{ "x-api-key" = $apiKey }

function New-Visitor([string]$namePrefix) {
  $body = @{
    name  = $namePrefix
    email = New-SafeEmail $namePrefix
  } | ConvertTo-Json -Depth 10

  $res = Invoke-RestMethod -ErrorAction Stop -Method Post -Uri "$Base/api/visitors" -Headers $headers -ContentType "application/json" -Body $body
  if ($res.ok -ne $true) { throw "Create visitor returned non-ok." }
  return [string]$res.visitorId
}

function Post-FormationEvent([string]$visitorId, [string]$type, [hashtable]$data, [datetime]$occurredAt) {
  $evt = @{
    v          = 1
    eventId    = [guid]::NewGuid().ToString()
    visitorId  = $visitorId
    type       = $type
    occurredAt = $occurredAt.ToUniversalTime().ToString("o")
    source     = @{ system = "assert-ops-followups-owners" }
    data       = $data
  } | ConvertTo-Json -Depth 20

  $resp = Invoke-RestMethod -ErrorAction Stop -Method Post -Uri "$Base/api/formation/events" -Headers $headers -ContentType "application/json" -Body $evt
  if ($resp.ok -ne $true) { throw "Formation event '$type' was not accepted." }
}

$now = (Get-Date).ToUniversalTime()
$runId = [guid]::NewGuid().ToString("N").Substring(0, 8)
$owner1Id = "ops-owner-$runId-1"
$owner2Id = "ops-owner-$runId-2"

$visitorA = New-Visitor "Owner Rollup A"
$visitorB = New-Visitor "Owner Rollup B"
$visitorC = New-Visitor "Owner Rollup C"

# owner-1 overdue: assigned 49h ago
Post-FormationEvent -visitorId $visitorA -type "FOLLOWUP_ASSIGNED" -data @{
  assigneeId = $owner1Id
} -occurredAt $now.AddHours(-49)

# owner-1 at risk: assigned 25h ago
Post-FormationEvent -visitorId $visitorB -type "FOLLOWUP_ASSIGNED" -data @{
  assigneeId = $owner1Id
} -occurredAt $now.AddHours(-25)

# owner-2 on track: assigned 2h ago
Post-FormationEvent -visitorId $visitorC -type "FOLLOWUP_ASSIGNED" -data @{
  assigneeId = $owner2Id
} -occurredAt $now.AddHours(-2)

$result = Invoke-RestMethod -ErrorAction Stop -Method Get -Uri "$Base/api/ops/followups?includeResolved=true&limit=100" -Headers $headers

if ($result.ok -ne $true) { throw "Expected ok=true from /ops/followups." }
if ($null -eq $result.owners) { throw "Expected owners rollup to exist." }
if ($result.owners.Count -lt 2) { throw "Expected at least 2 owners in rollup." }

foreach ($owner in $result.owners) {
  if ([string]::IsNullOrWhiteSpace([string]$owner.ownerId)) {
    throw "Owner rollup entry missing ownerId."
  }

  $sum = [int]($owner.resolved ?? 0) + [int]($owner.overdue ?? 0) + [int]($owner.atRisk ?? 0) + [int]($owner.onTrack ?? 0)
  if ($sum -ne [int]$owner.total) {
    throw "Owner rollup invariant failed for ownerId=$($owner.ownerId): total=$($owner.total), buckets=$sum"
  }
}

$owner1 = $result.owners | Where-Object { $_.ownerId -eq $owner1Id } | Select-Object -First 1
$owner2 = $result.owners | Where-Object { $_.ownerId -eq $owner2Id } | Select-Object -First 1

if ($null -eq $owner1) { throw "Expected owner-1 in rollup." }
if ($null -eq $owner2) { throw "Expected owner-2 in rollup." }

if ([int]$owner1.total -ne 2) { throw "Expected owner-1 total=2, got $($owner1.total)" }
if ([int]$owner1.overdue -ne 1) { throw "Expected owner-1 overdue=1, got $($owner1.overdue)" }
if ([int]$owner1.atRisk -ne 1) { throw "Expected owner-1 atRisk=1, got $($owner1.atRisk)" }
if ([int]$owner1.onTrack -ne 0) { throw "Expected owner-1 onTrack=0, got $($owner1.onTrack)" }

if ([int]$owner2.total -ne 1) { throw "Expected owner-2 total=1, got $($owner2.total)" }
if ([int]$owner2.overdue -ne 0) { throw "Expected owner-2 overdue=0, got $($owner2.overdue)" }
if ([int]$owner2.atRisk -ne 0) { throw "Expected owner-2 atRisk=0, got $($owner2.atRisk)" }
if ([int]$owner2.onTrack -ne 1) { throw "Expected owner-2 onTrack=1, got $($owner2.onTrack)" }

Write-Host "OK: /ops/followups owners rollup assertions passed." -ForegroundColor Green

