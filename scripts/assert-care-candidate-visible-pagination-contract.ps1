param(
  [string]$BaseUrl = "http://127.0.0.1:7071",
  [string]$ApiKey = $env:HOPE_API_KEY
)

$ErrorActionPreference = "Stop"

$ApiBase = ($BaseUrl.TrimEnd("/") + "/api")

$headers = @{
  "content-type" = "application/json"
}

if (-not [string]::IsNullOrWhiteSpace($ApiKey)) {
  $headers["x-api-key"] = $ApiKey
}

function Assert($Condition, [string]$Message) {
  if (-not $Condition) {
    throw "ASSERT FAILED: $Message"
  }
}

function Json-Get([string]$Url) {
  Invoke-RestMethod -Method Get -Uri $Url -Headers $headers
}

Write-Host "Running care candidate visible pagination regression..."
Write-Host "ApiBase=$ApiBase"

$page = Json-Get "$ApiBase/care/candidates?limit=5"
$summary = Json-Get "$ApiBase/care/summary"

Assert ($page.ok -eq $true) "care candidates page should be ok"
Assert ($summary.ok -eq $true) "care summary should be ok"

$totalCandidates = [int]$summary.summary.totalCandidates
$pageCount = [int]$page.count

if ($totalCandidates -gt 0) {
  Assert ($pageCount -gt 0) "care candidates should not return an empty visible page when summary has candidates"
}

Assert ($pageCount -le 5) "care candidates page should respect requested limit"

Write-Host "OK: care candidate visible pagination regression passed."
