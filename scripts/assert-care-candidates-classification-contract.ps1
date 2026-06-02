param(
  [string]$BaseUrl = "http://127.0.0.1:7071",
  [string]$ApiKey = $env:HOPE_API_KEY,
  [int]$Limit = 25
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

Write-Host "Running care candidates classification contract..."
Write-Host "ApiBase=$ApiBase"

$response = Invoke-RestMethod -Method Get -Uri "$ApiBase/care/candidates?limit=$Limit" -Headers $headers

Assert ($response.ok -eq $true) "care candidates response should be ok"

$items = @($response.items)

foreach ($item in $items) {
  Assert ($item.carePriority -eq "normal") "carePriority should be normal"
  Assert ($item.careAgeBucket -eq "new") "careAgeBucket should be new"
  Assert ($item.escalationLevel -eq "none") "escalationLevel should be none"
  Assert ($item.recommendedCareAction -eq "review_followup") "recommendedCareAction should match"
}

Write-Host "OK: care candidates classification contract passed."
