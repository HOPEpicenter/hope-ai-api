param(
  [Parameter(Mandatory=$true)][string]$ApiBase
)

$ErrorActionPreference = "Stop"

$headers = @{ "x-api-key" = $env:HOPE_API_KEY }
if (-not $headers["x-api-key"]) { throw "HOPE_API_KEY is required" }

Write-Host "[assert-formation-profile-fastpath] ApiBase=$ApiBase"

# Create visitor
$email = "ops+" + (Get-Date -Format "yyyyMMddHHmmss") + "@example.com"
$vid = (Invoke-RestMethod -Method Post -Uri "$ApiBase/visitors" -Headers $headers -ContentType "application/json" -Body (@{
  firstName="Ops"; lastName="FastPath"; email=$email
} | ConvertTo-Json -Depth 10)).id

Write-Host "[assert-formation-profile-fastpath] visitorId=$vid"

# Record one formation event (bootstrap snapshot)
$body = @{
  visitorId  = $vid
  type       = "INFO_REQUESTED"
  summary    = "fast-path assertion bootstrap"
  occurredAt = (Get-Date).ToUniversalTime().ToString("o")
  metadata   = @{ topic = "general" }
} | ConvertTo-Json -Depth 20

Invoke-RestMethod -Method Post -Uri "$ApiBase/formation/events" -Headers $headers -ContentType "application/json" -Body $body | Out-Null

# Assert fast-path
$resp = Invoke-RestMethod -Method Get -Uri "$ApiBase/formation/profiles?visitorId=$vid" -Headers $headers

if (-not $resp.ok) { throw "Expected ok=true but got ok=$($resp.ok)" }
if (-not $resp.items) { throw "Expected items array but got null/empty" }
if ($resp.items.Count -ne 1) { throw "Expected exactly 1 item, got $($resp.items.Count)" }

$item = $resp.items[0]
foreach ($k in @("visitorId","stage","updatedAt")) {
  if (-not $item.PSObject.Properties[$k]) { throw "Missing required key '$k'" }
  $v = $item.$k
  if ($null -eq $v -or ("" + $v).Trim().Length -eq 0) { throw "Required key '$k' is empty" }
}

Write-Host "[assert-formation-profile-fastpath] OK: fast-path shape valid"