param(
  [string]$ApiBase = "http://localhost:7071/api",
  [string]$ApiKey = $env:HOPE_API_KEY
)

Write-Host "[summary-journey] test start"

if (-not $ApiKey) {
  throw "HOPE_API_KEY is required"
}

$email = "summary-" + (Get-Date -Format "yyyyMMddHHmmss") + "@test.com"

$v = Invoke-RestMethod -Method Post -Uri "$ApiBase/visitors" -Body (@{
  name = "Summary Journey"
  email = $email
} | ConvertTo-Json) -ContentType "application/json"

$vid = $v.visitorId

$s = Invoke-RestMethod -Uri "$ApiBase/visitors/$vid/summary" -Headers @{
  "x-api-key" = $ApiKey
}

if (-not $s.summary.journey) {
  throw "summary.journey missing"
}

if ($s.summary.journey.currentStep -ne "NEW") {
  throw "expected NEW step"
}

Write-Host "[summary-journey] OK" -ForegroundColor Green
