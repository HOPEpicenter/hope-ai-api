param(
  [string]$BaseUrl = "http://127.0.0.1:7071/api",
  [string]$ApiKey = $env:HOPE_API_KEY
)

$ErrorActionPreference = "Stop"

if ([string]::IsNullOrWhiteSpace($ApiKey)) {
  throw "HOPE_API_KEY env var is required."
}

$headers = @{
  "x-api-key" = $ApiKey
}

$result = Invoke-RestMethod `
  -Method GET `
  -Uri "$BaseUrl/staff-identities" `
  -Headers $headers

if ($result.ok -ne $true) {
  throw "Expected ok=true."
}

if ($null -eq $result.items) {
  throw "Expected items collection."
}

if ($result.count -ne @($result.items).Count) {
  throw "Expected count to equal items length."
}

$opsUser1 = @(
  $result.items |
  Where-Object { $_.staffId -eq "ops-user-1" }
)

if ($opsUser1.Count -ne 1) {
  throw "Expected canonical ops-user-1 identity."
}

if ($opsUser1[0].displayName -ne "Operations Team") {
  throw "Expected Operations Team display name."
}

if ([string]::IsNullOrWhiteSpace($opsUser1[0].roleLabel)) {
  throw "Expected roleLabel."
}

Write-Host "OK: staff directory read contract v1 works." -ForegroundColor Green
