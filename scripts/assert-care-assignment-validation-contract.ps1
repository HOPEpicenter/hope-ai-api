param(
  [string]$BaseUrl = "http://127.0.0.1:7071",
  [string]$ApiKey = $env:HOPE_API_KEY
)

$ErrorActionPreference = "Stop"

$RootBase = $BaseUrl.TrimEnd("/")
if ($RootBase -match "/api$") {
  $ApiBase = $RootBase
} else {
  $ApiBase = "$RootBase/api"
}

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

function Expect-BadRequest(
  [string]$Url,
  [hashtable]$Body
) {
  $resp = Invoke-WebRequest `
    -Method Post `
    -Uri $Url `
    -Headers $headers `
    -ContentType "application/json" `
    -Body ($Body | ConvertTo-Json -Depth 20) `
    -SkipHttpErrorCheck

  Assert ([int]$resp.StatusCode -eq 400) "Expected HTTP 400 but got $([int]$resp.StatusCode)"
}
Write-Host "Running care assignment validation contract..."
Write-Host "ApiBase=$ApiBase"

$missingVisitorId = "missing-$([guid]::NewGuid().ToString('N'))"

Expect-BadRequest `
  "$ApiBase/care/candidates/$missingVisitorId/assign" `
  @{}

Expect-BadRequest `
  "$ApiBase/care/candidates/assign-bulk" `
  @{
    visitorIds = @("a","b")
  }

Expect-BadRequest `
  "$ApiBase/care/candidates/assign-bulk" `
  @{
    visitorIds = @()
    assignedTo = "ops-user-1"
  }

Expect-BadRequest `
  "$ApiBase/care/candidates/unassign-bulk" `
  @{
    visitorIds = @()
  }

Write-Host "OK: care assignment validation contract passed."


