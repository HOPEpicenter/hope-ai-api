param(
  [string]$BaseUrl = "http://127.0.0.1:3000/api",
  [string]$ApiKey = $env:HOPE_API_KEY
)

$ErrorActionPreference = "Stop"

$ApiBase = $BaseUrl.TrimEnd("/")
if ($ApiBase -notmatch "/api$") {
  $ApiBase = "$ApiBase/api"
}

$headers = @{ "content-type" = "application/json" }
if (-not [string]::IsNullOrWhiteSpace($ApiKey)) {
  $headers["x-api-key"] = $ApiKey
}

function Assert($Condition, [string]$Message) {
  if (-not $Condition) { throw "ASSERT FAILED: $Message" }
}

$visitor = Invoke-RestMethod -Method Post -Uri "$ApiBase/visitors" -Headers $headers -ContentType "application/json" -Body (@{
  name = "Dashboard Card Contract $([guid]::NewGuid().ToString('N').Substring(0,8))"
  email = "dashboard-card-contract+$([guid]::NewGuid().ToString('N'))@example.com"
  source = "assert-dashboard-card-contract.ps1"
} | ConvertTo-Json -Depth 20)

$visitorId = [string]$visitor.visitorId
Assert (-not [string]::IsNullOrWhiteSpace($visitorId)) "visitorId should be returned"

$card = Invoke-RestMethod -Method Get -Uri "$ApiBase/visitors/$visitorId/dashboard-card" -Headers $headers

Assert ($card.ok -eq $true) "dashboard card response should include ok=true"
Assert (-not [string]::IsNullOrWhiteSpace([string]$card.requestId)) "dashboard card response should include requestId"
Assert ([string]$card.visitorId -eq $visitorId) "dashboard card visitorId should match"
Assert ($null -ne $card.card) "dashboard card payload should include card"

Write-Host "OK: dashboard card contract passed."