param(
  [Parameter(Mandatory=$true)][string]$BaseUrl,
  [Parameter(Mandatory=$true)][string]$ApiKey
)

$ErrorActionPreference = "Stop"

$headers = @{
  "x-api-key" = $ApiKey
}

$url = $BaseUrl.TrimEnd("/") + "/ops/formation/profile-audit?limit=5"

$result = Invoke-RestMethod -Method Get -Uri $url -Headers $headers

if ($result.ok -ne $true) {
  throw "Expected ok=true from bulk formation profile audit."
}

if ($result.limit -lt 1 -or $result.limit -gt 50) {
  throw "Expected limit to be between 1 and 50."
}

if ($null -eq $result.items) {
  throw "Expected items array from bulk formation profile audit."
}

if ($null -eq $result.count) {
  throw "Expected count from bulk formation profile audit."
}

if ($null -eq $result.scanned) {
  throw "Expected scanned from bulk formation profile audit."
}

if ($null -eq $result.driftedCount) {
  throw "Expected driftedCount from bulk formation profile audit."
}

if ($null -eq $result.cleanCount) {
  throw "Expected cleanCount from bulk formation profile audit."
}

if ($null -eq $result.scanTruncated) {
  throw "Expected scanTruncated from bulk formation profile audit."
}

$driftedUrl = $BaseUrl.TrimEnd("/") + "/ops/formation/profile-audit?limit=5&drifted=true"
$driftedResult = Invoke-RestMethod -Method Get -Uri $driftedUrl -Headers $headers

if ($driftedResult.ok -ne $true) {
  throw "Expected ok=true from drifted bulk formation profile audit."
}

if ($driftedResult.drifted -ne $true) {
  throw "Expected drifted=true echo from filtered bulk formation profile audit."
}

foreach ($item in @($driftedResult.items)) {
  if ($item.drifted -ne $true) {
    throw "Expected only drifted=true items from filtered bulk formation profile audit."
  }
}

Write-Host "[assert-formation-profile-audit-list] OK" -ForegroundColor Green



