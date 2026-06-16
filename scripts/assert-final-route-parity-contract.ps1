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

function Invoke-JsonPost([string]$Url, [hashtable]$Body) {
  Invoke-RestMethod -Method Post -Uri $Url -Headers $headers -ContentType "application/json" -Body ($Body | ConvertTo-Json -Depth 20)
}

Write-Host "Running final route parity contract..."
Write-Host "ApiBase=$ApiBase"

$visitor = Invoke-JsonPost "$ApiBase/visitors" @{
  name = "Final Route Parity $([guid]::NewGuid().ToString('N').Substring(0,8))"
  email = "final-route-parity+$([guid]::NewGuid().ToString('N'))@example.com"
  source = "assert-final-route-parity-contract.ps1"
}

$visitorId = [string]$visitor.visitorId
Assert (-not [string]::IsNullOrWhiteSpace($visitorId)) "visitorId should be returned"

$activity = Invoke-RestMethod -Method Get -Uri "$ApiBase/visitors/$visitorId/activity-insights?windowDays=7" -Headers $headers
Assert ($activity.ok -eq $true) "activity insights should return ok=true"
Assert ([string]$activity.visitorId -eq $visitorId) "activity insights visitorId should match"
Assert ($null -ne $activity.insights) "activity insights payload should include insights"
Assert ([int]$activity.insights.windowDays -eq 7) "activity insights windowDays should be 7"

if (-not [string]::IsNullOrWhiteSpace($ApiKey)) {
  $pingOk = Invoke-WebRequest -Method Get -Uri "$ApiBase/_protected/ping?limit=1" -Headers $headers -SkipHttpErrorCheck
  Assert ([int]$pingOk.StatusCode -eq 200) "protected ping valid request should return 200"

  $pingBadLimit = Invoke-WebRequest -Method Get -Uri "$ApiBase/_protected/ping?limit=abc" -Headers $headers -SkipHttpErrorCheck
  Assert ([int]$pingBadLimit.StatusCode -eq 400) "protected ping invalid limit should return 400"

  $pingNoKey = Invoke-WebRequest -Method Get -Uri "$ApiBase/_protected/ping?limit=1" -SkipHttpErrorCheck
  Assert ([int]$pingNoKey.StatusCode -eq 401) "protected ping missing key should return 401"
} else {
  Write-Host "Skipping protected ping contract because HOPE_API_KEY is not set."
}

Write-Host "OK: final route parity contract passed."