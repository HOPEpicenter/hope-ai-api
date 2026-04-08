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

function Has-Prop($obj, [string]$name) {
  return ($null -ne $obj) -and ($obj.PSObject.Properties.Name -contains $name)
}

$apiKey = Require-Env "HOPE_API_KEY"
$headers = @{ "x-api-key" = $apiKey }

function New-Visitor([string]$namePrefix) {
  $body = @{
    name  = $namePrefix
    email = New-SafeEmail $namePrefix
  } | ConvertTo-Json -Depth 10

  $res = Invoke-RestMethod -ErrorAction Stop -Method Post -Uri "$Base/api/visitors" -Headers $headers -ContentType "application/json" -Body $body

  if ($res.ok -ne $true) {
    throw "Create visitor returned non-ok: $($res | ConvertTo-Json -Depth 10)"
  }

  if ([string]::IsNullOrWhiteSpace([string]$res.visitorId)) {
    throw "Create visitor missing visitorId: $($res | ConvertTo-Json -Depth 10)"
  }

  return [string]$res.visitorId
}

function Post-GroupJoined([string]$visitorId, [string]$groupId, [string]$displayName, [datetime]$occurredAt) {
  $evt = @{
    v          = 1
    eventId    = [guid]::NewGuid().ToString()
    visitorId  = $visitorId
    type       = "GROUP_JOINED"
    occurredAt = $occurredAt.ToUniversalTime().ToString("o")
    source     = @{ system = "assert-integration-summary-groups" }
    data       = @{
      groupId     = $groupId
      displayName = $displayName
    }
  } | ConvertTo-Json -Depth 20

  $resp = Invoke-WebRequest -ErrorAction Stop -Method Post -Uri "$Base/api/formation/events" -Headers $headers -ContentType "application/json" -Body $evt

  if (($resp.StatusCode -lt 200) -or ($resp.StatusCode -ge 300)) {
    throw "GROUP_JOINED returned HTTP $($resp.StatusCode)"
  }

  if ([string]::IsNullOrWhiteSpace($resp.Content)) {
    return
  }

  try {
    $parsed = $resp.Content | ConvertFrom-Json -ErrorAction Stop
    $hasAccepted = $parsed.PSObject.Properties.Name -contains "accepted"
    $hasVisitorId = $parsed.PSObject.Properties.Name -contains "visitorId"

    if (($hasAccepted -and $parsed.accepted -eq $true) -or
        ($hasVisitorId -and -not [string]::IsNullOrWhiteSpace([string]$parsed.visitorId))) {
      return
    }
  } catch {
    return
  }
}

function Get-FormationProfile([string]$visitorId) {
  return Invoke-RestMethod -ErrorAction Stop -Method Get -Uri "$Base/api/visitors/$visitorId/formation/profile" -Headers $headers
}

function Get-IntegrationSummary([string]$visitorId) {
  return Invoke-RestMethod -ErrorAction Stop -Method Get -Uri "$Base/api/integration/summary?visitorId=$([Uri]::EscapeDataString($visitorId))" -Headers $headers
}

$visitorId = New-Visitor "Group Summary"
Write-Host "[assert-integration-summary-groups] visitorId=$visitorId"

$now = (Get-Date).ToUniversalTime()
$groupId = "group-alpha"

Post-GroupJoined -visitorId $visitorId -groupId $groupId -displayName "Alpha Group" -occurredAt $now
Post-GroupJoined -visitorId $visitorId -groupId $groupId -displayName "Alpha Group Renamed" -occurredAt $now.AddSeconds(5)

$profile = Get-FormationProfile $visitorId
if (-not $profile.ok) { throw "Expected ok=true from formation profile endpoint." }
if (-not $profile.profile) { throw "Expected profile to exist." }

if (-not (Has-Prop $profile.profile "groups")) { throw "Expected profile.groups to exist." }
if ($null -eq $profile.profile.groups) { throw "Expected profile.groups to be non-null." }
if ($profile.profile.groups.Count -ne 1) { throw "Expected exactly 1 profile group, got $($profile.profile.groups.Count)" }

$group = $profile.profile.groups[0]
if ([string]$group.groupId -ne $groupId) { throw "Expected profile.groups[0].groupId='$groupId', got '$($group.groupId)'" }
if ([string]$group.displayName -ne "Alpha Group Renamed") { throw "Expected updated displayName in profile, got '$($group.displayName)'" }

$summary = Get-IntegrationSummary $visitorId
if ($summary.ok -ne $true) { throw "Expected ok=true from integration summary." }
if (-not $summary.summary) { throw "Expected summary payload." }

if (-not (Has-Prop $summary.summary "groups")) { throw "Expected summary.groups to exist." }
if ($null -eq $summary.summary.groups) { throw "Expected summary.groups to be non-null." }
if ($summary.summary.groups.Count -ne 1) { throw "Expected exactly 1 summary group, got $($summary.summary.groups.Count)" }

$summaryGroup = $summary.summary.groups[0]
if ([string]$summaryGroup.groupId -ne $groupId) { throw "Expected summary.groups[0].groupId='$groupId', got '$($summaryGroup.groupId)'" }
if ([string]$summaryGroup.displayName -ne "Alpha Group Renamed") { throw "Expected updated displayName in summary, got '$($summaryGroup.displayName)'" }

Write-Host "OK: integration summary groups assertions passed. visitorId=$visitorId" -ForegroundColor Green

