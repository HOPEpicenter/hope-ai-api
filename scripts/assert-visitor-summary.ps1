param(
  [string]$Base = "http://localhost:7071/api",
  [string]$ApiKey = ""
)

if ([string]::IsNullOrWhiteSpace($ApiKey) -and -not [string]::IsNullOrWhiteSpace($env:HOPE_API_KEY)) {
  $ApiKey = $env:HOPE_API_KEY
}

Write-Host "[assert-visitor-summary] Creating visitor..."

$stamp = [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()
$body = @{
  name  = "Visitor Summary Smoke $stamp"
  email = "visitorsummary+$stamp@example.com"
} | ConvertTo-Json

$create = Invoke-RestMethod -Method POST -Uri "$Base/visitors" -Body $body -ContentType "application/json"

$visitorId = $create.visitorId
if ([string]::IsNullOrWhiteSpace($visitorId)) {
  throw "visitor create did not return visitorId"
}

Write-Host "[assert-visitor-summary] visitorId=$visitorId"

$headers = @{}
if (-not [string]::IsNullOrWhiteSpace($ApiKey)) {
  $headers["x-api-key"] = $ApiKey
}

$summary = Invoke-RestMethod -Method GET -Uri "$Base/visitors/$visitorId/summary" -Headers $headers

if (-not $summary.ok) { throw "summary.ok false" }
if (-not $summary.summary) { throw "missing summary" }
if (-not $summary.summary.engagement) { throw "missing engagement" }
if (-not $summary.summary.integration) { throw "missing integration" }

Write-Host "[assert-visitor-summary] OK" -ForegroundColor Green
