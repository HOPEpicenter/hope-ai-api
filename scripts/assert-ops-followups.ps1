# scripts/assert-ops-followups.ps1
# Regression: OPS followups projection stays healthy + reflects formation followup assignment/outcome.
# PowerShell 7+.

[CmdletBinding()]
param(
  # Preferred: single root base (script derives /api + /ops)
  [Parameter(Mandatory=$false)]
  [string]$BaseUrl,

  # Back-compat: explicit bases
  [Parameter(Mandatory=$false)]
  [string]$ApiBase,

  [Parameter(Mandatory=$false)]
  [string]$OpsBase,

  # Auth (required for /ops + protected /api)
  [Parameter(Mandatory=$false)]
  [string]$ApiKey
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"
$ProgressPreference = "SilentlyContinue"

function Normalize-Base([string]$u) {
  if ([string]::IsNullOrWhiteSpace($u)) { return "" }
  return $u.Trim().TrimEnd("/")
}

function Require-ApiKey([string]$k) {
  if ([string]::IsNullOrWhiteSpace($k)) {
    throw "HOPE_API_KEY is required (set env:HOPE_API_KEY or pass -ApiKey)."
  }
  return $k
}

# Resolve bases
$BaseUrl = Normalize-Base $BaseUrl
$ApiBase = Normalize-Base $ApiBase
$OpsBase = Normalize-Base $OpsBase

if (-not $BaseUrl) {
  if (-not $ApiBase -or -not $OpsBase) {
    throw "Provide -BaseUrl OR both -ApiBase and -OpsBase."
  }
} else {
  if (-not $ApiBase) { $ApiBase = "$BaseUrl/api" }
  if (-not $OpsBase) { $OpsBase = "$BaseUrl/ops" }
}

# Resolve api key
if ([string]::IsNullOrWhiteSpace($ApiKey)) {
  $ApiKey = (Get-Item ("env:" + "HOPE_API_KEY") -ErrorAction SilentlyContinue).Value
}
$ApiKey = Require-ApiKey $ApiKey

$headers = @{ "x-api-key" = $ApiKey }

Write-Host ("[assert-ops-followups] ApiBase={0} OpsBase={1}" -f $ApiBase, $OpsBase)

function GetJson([string]$url) {
  return Invoke-RestMethod -Method Get -Uri $url -Headers $headers
}

function PostJson([string]$url, [object]$body) {
  return Invoke-RestMethod -Method Post -Uri $url -Headers $headers -ContentType "application/json" -Body ($body | ConvertTo-Json -Depth 20)
}

function GetFollowups() {
  $fu = GetJson "$OpsBase/followups"
  if ($null -eq $fu.ok) { throw "Expected /ops/followups to return an 'ok' field." }
  if (-not $fu.ok) { throw ("Expected ok=true; got ok={0} error={1}" -f $fu.ok, $fu.error) }
  if ($null -eq $fu.items) { throw "Expected /ops/followups to return 'items' array." }
  return $fu
}

# 1) Fresh /ops/followups must be healthy/authenticated
Write-Host "[assert-ops-followups] GET /ops/followups (fresh) ..."
$fu0 = GetFollowups | Out-Null

# 2) Create a visitor
Write-Host "[assert-ops-followups] POST /api/visitors ..."
$email = "ops-followups+" + (Get-Date -Format "yyyyMMddHHmmss") + "@example.com"
$visitor = PostJson "$ApiBase/visitors" @{
  firstName = "Ops"
  lastName  = "Followups"
  email     = $email
}

$visitorId = $visitor.visitorId
if ([string]::IsNullOrWhiteSpace($visitorId)) { $visitorId = $visitor.id }
if ([string]::IsNullOrWhiteSpace($visitorId)) {
  throw "Visitor id missing (expected visitorId or id)."
}
Write-Host "[assert-ops-followups] visitorId=$visitorId"

# 3) Record FOLLOWUP_ASSIGNED then ensure it appears in /ops/followups unresolved
Write-Host "[assert-ops-followups] POST /api/formation/events FOLLOWUP_ASSIGNED ..."
$now = (Get-Date).ToUniversalTime()
$null = PostJson "$ApiBase/formation/events" @{
  id         = [Guid]::NewGuid().ToString()
  visitorId  = $visitorId
  type       = "FOLLOWUP_ASSIGNED"
  occurredAt = $now.ToString("o")
  metadata   = @{ assigneeId = "ops-user-1" }
}

Start-Sleep -Milliseconds 250

Write-Host "[assert-ops-followups] GET /ops/followups (after assignment) ..."
$fuA = GetFollowups
$itemA = @($fuA.items) | Where-Object { $_.visitorId -eq $visitorId } | Select-Object -First 1
if (-not $itemA) { throw "Expected visitorId=$visitorId to appear in followups queue after FOLLOWUP_ASSIGNED." }

if ($itemA.resolvedForAssignment -eq $true) { throw "Expected resolvedForAssignment=false after assignment." }

if (-not $itemA.assignedTo -or $itemA.assignedTo.ownerId -ne "ops-user-1") {
  throw ("Expected assignedTo.ownerId=ops-user-1. Got: {0}" -f ($itemA.assignedTo | ConvertTo-Json -Depth 6))
}

# 4) Record FOLLOWUP_UNASSIGNED then ensure it remains in /ops/followups with no assignee
Write-Host "[assert-ops-followups] POST /api/formation/events FOLLOWUP_UNASSIGNED ..."
$unassignAt = $now.AddSeconds(1)
$null = PostJson "$ApiBase/formation/events" @{
  id         = [Guid]::NewGuid().ToString()
  visitorId  = $visitorId
  type       = "FOLLOWUP_UNASSIGNED"
  occurredAt = $unassignAt.ToString("o")
  metadata   = @{}
}

Start-Sleep -Milliseconds 250

Write-Host "[assert-ops-followups] GET /ops/followups (after unassign) ..."
$fuU = GetFollowups
$itemU = @($fuU.items) | Where-Object { $_.visitorId -eq $visitorId } | Select-Object -First 1
if (-not $itemU) { throw "Expected visitorId=$visitorId to remain in followups queue after FOLLOWUP_UNASSIGNED." }
if ($itemU.resolvedForAssignment -eq $true) { throw "Expected resolvedForAssignment=false after unassign." }
if ($itemU.assignedTo) {
  throw ("Expected assignedTo to be cleared after unassign. Got: {0}" -f ($itemU.assignedTo | ConvertTo-Json -Depth 6))
}

# 5) Record FOLLOWUP_ASSIGNED again then ensure it is reassigned
Write-Host "[assert-ops-followups] POST /api/formation/events FOLLOWUP_ASSIGNED (reassign) ..."
$reassignAt = $now.AddSeconds(2)
$null = PostJson "$ApiBase/formation/events" @{
  id         = [Guid]::NewGuid().ToString()
  visitorId  = $visitorId
  type       = "FOLLOWUP_ASSIGNED"
  occurredAt = $reassignAt.ToString("o")
  metadata   = @{ assigneeId = "ops-user-1" }
}

Start-Sleep -Milliseconds 250

Write-Host "[assert-ops-followups] GET /ops/followups (after reassign) ..."
$fuR = GetFollowups
$itemR = @($fuR.items) | Where-Object { $_.visitorId -eq $visitorId } | Select-Object -First 1
if (-not $itemR) { throw "Expected visitorId=$visitorId to remain in followups queue after reassignment." }
if ($itemR.resolvedForAssignment -eq $true) { throw "Expected resolvedForAssignment=false after reassignment." }
if (-not $itemR.assignedTo -or $itemR.assignedTo.ownerId -ne "ops-user-1") {
  throw ("Expected assignedTo.ownerId=ops-user-1 after reassignment. Got: {0}" -f ($itemR.assignedTo | ConvertTo-Json -Depth 6))
}

# 6) Record FOLLOWUP_CONTACTED then ensure it remains in /ops/followups
Write-Host "[assert-ops-followups] POST /api/formation/events FOLLOWUP_CONTACTED ..."
$contactAt = $now.AddSeconds(3)
$null = PostJson "$ApiBase/formation/events" @{
  id         = [Guid]::NewGuid().ToString()
  visitorId  = $visitorId
  type       = "FOLLOWUP_CONTACTED"
  occurredAt = $contactAt.ToString("o")
  metadata   = @{ method = "sms"; result = "reached" }
}

Start-Sleep -Milliseconds 250

Write-Host "[assert-ops-followups] GET /ops/followups (after contact) ..."
$fuC = GetFollowups
$itemC = @($fuC.items) | Where-Object { $_.visitorId -eq $visitorId } | Select-Object -First 1
if (-not $itemC) { throw "Expected visitorId=$visitorId to remain in followups queue after FOLLOWUP_CONTACTED." }
if ($itemC.resolvedForAssignment -eq $true) { throw "Expected resolvedForAssignment=false after contact." }
if (-not $itemC.assignedTo -or $itemC.assignedTo.ownerId -ne "ops-user-1") {
  throw ("Expected assignedTo.ownerId=ops-user-1 after contact. Got: {0}" -f ($itemC.assignedTo | ConvertTo-Json -Depth 6))
}

# 7) Record FOLLOWUP_OUTCOME_RECORDED then ensure it is resolved (no longer present)
Write-Host "[assert-ops-followups] POST /api/formation/events FOLLOWUP_OUTCOME_RECORDED ..."
$outcomeAt = $now.AddSeconds(5)
$null = PostJson "$ApiBase/formation/events" @{
  id         = [Guid]::NewGuid().ToString()
  visitorId  = $visitorId
  type       = "FOLLOWUP_OUTCOME_RECORDED"
  occurredAt = $outcomeAt.ToString("o")
  metadata   = @{ outcome = "connected" }
}

Start-Sleep -Milliseconds 250

Write-Host "[assert-ops-followups] GET /ops/followups (after outcome) ..."
$fuO = GetFollowups
$itemO = @($fuO.items) | Where-Object { $_.visitorId -eq $visitorId } | Select-Object -First 1
if ($itemO) { throw "Expected visitorId=$visitorId to be resolved and not present after outcome." }

Write-Host "[assert-ops-followups] OK: followups lifecycle regression passed." -ForegroundColor Green


