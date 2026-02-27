# scripts/assert-ops-followups.ps1
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
if ([string]::IsNullOrWhiteSpace($ApiKey)) {
  throw "HOPE_API_KEY is required (set env:HOPE_API_KEY or pass -ApiKey)."
}

$headers = @{ "x-api-key" = $ApiKey }

Write-Host ("[assert-ops-followups] ApiBase={0} OpsBase={1}" -f $ApiBase, $OpsBase)

function GetJson([string]$url) {
  return Invoke-RestMethod -Method Get -Uri $url -Headers $headers
}

function PostJson([string]$url, [object]$body) {
  return Invoke-RestMethod -Method Post -Uri $url -Headers $headers -ContentType "application/json" -Body ($body | ConvertTo-Json -Depth 20)
}

# 1) GET /ops/followups (should be authorized + structured)
Write-Host "[assert-ops-followups] GET /ops/followups ..."
$fu = GetJson "$OpsBase/followups"

if ($null -eq $fu.ok) { throw "Expected /ops/followups to return an 'ok' field." }
if (-not $fu.ok) { throw ("Expected ok=true; got ok={0} error={1}" -f $fu.ok, $fu.error) }
if ($null -eq $fu.items) { throw "Expected /ops/followups to return 'items' array." }

# 2) Create a visitor (auth required) and capture id reliably
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

# 3) Re-check followups endpoint is still healthy/authenticated
Write-Host "[assert-ops-followups] GET /ops/followups (post-create sanity) ..."
$fu2 = GetJson "$OpsBase/followups"
if (-not $fu2.ok) { throw "Expected ok=true after visitor create." }

Write-Host "[assert-ops-followups] OK: ops followups assertions passed." -ForegroundColor Green