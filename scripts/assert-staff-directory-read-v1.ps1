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

$compatibilityIdentities = @(
  $result.items |
  Where-Object {
    $_.staffId -eq "ops-user-1" -or
    $_.staffId -eq "ops-user-2"
  }
)

if ($compatibilityIdentities.Count -ne 0) {
  throw "Compatibility operator identities must not appear in the canonical Staff directory."
}

$nonEventBackedIdentities = @(
  $result.items |
  Where-Object {
    [string]::IsNullOrWhiteSpace([string]$_.createdAt) -or
    [string]::IsNullOrWhiteSpace([string]$_.lastEventId)
  }
)

if ($nonEventBackedIdentities.Count -ne 0) {
  throw "Every canonical Staff identity must be backed by Staff events."
}

Write-Host "OK: canonical Staff directory contains only event-backed identities." -ForegroundColor Green
