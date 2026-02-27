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

# 4) Record FOLLOWUP_OUTCOME_RECORDED then ensure it is resolved (no longer present)
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