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

Write-Host "Running care candidate pagination consistency regression..."
Write-Host "ApiBase=$ApiBase"

$page1 = Json-Get "$ApiBase/care/candidates?limit=5"

Assert ($page1.ok -eq $true) "page1 should be ok"
Assert ($page1.count -le 5) "page1 count should respect limit"

if (-not $page1.nextCursor) {
  Write-Host "Skipping second-page assertion because candidate list has no nextCursor."
  Write-Host "OK: care candidate pagination consistency regression passed."
  exit 0
}

$page2 = Json-Get "$ApiBase/care/candidates?limit=5&cursor=$($page1.nextCursor)"

Assert ($page2.ok -eq $true) "page2 should be ok"
Assert ($page2.count -le 5) "page2 count should respect limit"

$page1Ids = @($page1.items | ForEach-Object { [string]$_.visitorId })
$page2Ids = @($page2.items | ForEach-Object { [string]$_.visitorId })

$overlap = @($page1Ids | Where-Object { $page2Ids -contains $_ })

Assert ($overlap.Count -eq 0) "page1 and page2 should not contain overlapping visitorIds"

Write-Host "OK: care candidate pagination consistency regression passed."
