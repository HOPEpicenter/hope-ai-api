param(
  [Parameter(Mandatory=$true)][string]$BaseUrl,
  [Parameter(Mandatory=$true)][string]$ApiKey
)

$ErrorActionPreference = "Stop"

if ($BaseUrl -match "[<>]" -or $BaseUrl.Trim().Length -eq 0) {
  throw "BaseUrl must be a real staging URL, not a placeholder."
}

if ($ApiKey -match "[<>]" -or $ApiKey.Trim().Length -eq 0) {
  throw "ApiKey must be a real staging API key, not a placeholder."
}

$headers = @{
  "x-api-key" = $ApiKey
}

$opsBase = $BaseUrl.TrimEnd("/") + "/api/_ops"

Write-Host "[verify-ops-formation-audit-staging] POST missing visitorId validation ..."
$bad = Invoke-WebRequest `
  -Method Post `
  -Uri "$opsBase/formation/profile-audit" `
  -Headers $headers `
  -ContentType "application/json" `
  -Body (@{ repair = $false } | ConvertTo-Json -Depth 20) `
  -SkipHttpErrorCheck

if ($bad.StatusCode -ne 400) {
  throw "Expected missing visitorId POST to return 400, got $($bad.StatusCode)"
}

Write-Host "[verify-ops-formation-audit-staging] OK" -ForegroundColor Green

