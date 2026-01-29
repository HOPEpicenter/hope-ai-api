param(
  [Parameter(Mandatory=$true)][string]$ApiBase,
  [string]$ApiKey
)

$ErrorActionPreference = "Stop"

# Resolve api key
if ([string]::IsNullOrWhiteSpace($ApiKey)) {
  $ApiKey = (Get-Item ("env:" + "HOPE_API_KEY") -ErrorAction SilentlyContinue).Value
}
if ([string]::IsNullOrWhiteSpace($ApiKey)) { throw "HOPE_API_KEY is required (env or -ApiKey)" }

$headers = @{ "x-api-key" = $ApiKey }

# Debug (safe): show length + last4 only
$last4 = if ($ApiKey.Length -ge 4) { $ApiKey.Substring($ApiKey.Length-4) } else { $ApiKey }
Write-Host "[assert-formation-profile-fastpath] ApiBase=$ApiBase"
Write-Host "[assert-formation-profile-fastpath] x-api-key len=$($ApiKey.Length) last4=$last4"

# Create visitor (MUST send headers)
$email = "ops+" + (Get-Date -Format "yyyyMMddHHmmss") + "@example.com"
$vid = (Invoke-RestMethod -Method Post -Uri "$ApiBase/visitors" -Headers $headers -ContentType "application/json" -Body (@{
  firstName="Ops"; lastName="FastPath"; email=$email
} | ConvertTo-Json -Depth 10)).id

Write-Host "[assert-formation-profile-fastpath] visitorId=$vid"

# Record one formation event (bootstrap snapshot) (MUST send headers)
$body = @{
  visitorId  = $vid
  type       = "INFO_REQUESTED"
  summary    = "fast-path assertion bootstrap"
  occurredAt = (Get-Date).ToUniversalTime().ToString("o")
  metadata   = @{ topic = "general" }
} | ConvertTo-Json -Depth 20

Invoke-RestMethod -Method Post -Uri "$ApiBase/formation/events" -Headers $headers -ContentType "application/json" -Body $body | Out-Null

# Assert fast-path (MUST send headers)
$resp = Invoke-RestMethod -Method Get -Uri "$ApiBase/formation/profiles?visitorId=$vid" -Headers $headers

if (-not $resp.ok) { throw "Expected ok=true but got ok=$($resp.ok) error=$($resp.error)" }
if (-not $resp.items) { throw "Expected items array but got null/empty" }
if ($resp.items.Count -ne 1) { throw "Expected exactly 1 item, got $($resp.items.Count)" }

$item = $resp.items[0]
foreach ($k in @("visitorId","stage","updatedAt")) {
  if (-not $item.PSObject.Properties[$k]) { throw "Missing required key '$k'" }
  $v = $item.$k
  if ($null -eq $v -or ("" + $v).Trim().Length -eq 0) { throw "Required key '$k' is empty" }
}

Write-Host "[assert-formation-profile-fastpath] OK: fast-path shape valid"