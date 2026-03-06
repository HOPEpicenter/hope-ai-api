param(
  [Parameter(Mandatory=$false)]
  [string] $ApiBase = "https://hope-ai-api-staging.azurewebsites.net",

  [Parameter(Mandatory=$false)]
  [string] $ApiKey = $env:HOPE_API_KEY
)

$ErrorActionPreference = "Stop"

function Invoke-Api {
  param(
    [Parameter(Mandatory=$true)][string] $Method,
    [Parameter(Mandatory=$true)][string] $Url,
    [hashtable] $Headers = @{},
    [string] $Body = $null
  )

  $opts = @{
    Method = $Method
    Uri    = $Url
    Headers = $Headers
    SkipHttpErrorCheck = $true
  }

  if ($null -ne $Body) {
    $opts["ContentType"] = "application/json"
    $opts["Body"] = $Body
  }

  return Invoke-WebRequest @opts
}

function Get-BodyText {
  param([Parameter(Mandatory=$true)] $Resp)
  if ($Resp.Content -is [byte[]]) { return [Text.Encoding]::UTF8.GetString($Resp.Content) }
  return [string]$Resp.Content
}

function Assert-Status {
  param(
    [Parameter(Mandatory=$true)] $Resp,
    [Parameter(Mandatory=$true)][int] $Expected,
    [Parameter(Mandatory=$true)][string] $Msg
  )

  if ([int]$Resp.StatusCode -ne $Expected) {
    $bodyText = Get-BodyText $Resp
    throw "$Msg`nExpected HTTP $Expected but got $($Resp.StatusCode).`nUrl: $($Resp.BaseResponse.ResponseUri)`nBody: $bodyText"
  }
}

Write-Host "[assert-auth-scoping-ops] ApiBase=$ApiBase"

# 1) Public endpoint: /api/health should be 200 without x-api-key
$health = Invoke-Api -Method GET -Url "$ApiBase/api/health"
Assert-Status -Resp $health -Expected 200 -Msg "[auth-scoping] /api/health should be public"

# 2) Create a visitor (public) so we have a visitorId for ops queries
$createBody = @{
  name  = "Auth Scoping Smoke"
  email = "auth-scoping+$([guid]::NewGuid().ToString('N'))@example.com"
} | ConvertTo-Json

$create = Invoke-Api -Method POST -Url "$ApiBase/api/visitors" -Body $createBody
Assert-Status -Resp $create -Expected 200 -Msg "[auth-scoping] POST /api/visitors should succeed"

$createJson = (Get-BodyText $create) | ConvertFrom-Json
$vid = [string]$createJson.visitorId
if ([string]::IsNullOrWhiteSpace($vid)) { throw "[auth-scoping] Missing visitorId from POST /api/visitors" }

# 3) Protected endpoint: /ops/engagements requires x-api-key and visitorId
# - No key => 401
$opsUrlBase = "$ApiBase/ops/engagements?visitorId=$vid&limit=1"
$noKey = Invoke-Api -Method GET -Url $opsUrlBase
Assert-Status -Resp $noKey -Expected 401 -Msg "[auth-scoping] /ops/engagements should require x-api-key (missing key => 401)"

# - With key but missing required query => 400 (visitorId missing)
if ([string]::IsNullOrWhiteSpace($ApiKey)) {
  throw "[auth-scoping] HOPE_API_KEY is not set. Set env var HOPE_API_KEY to run protected assertions."
}
$headers = @{ "x-api-key" = $ApiKey }

$missingVisitorId = Invoke-Api -Method GET -Url "$ApiBase/ops/engagements?limit=1" -Headers $headers
Assert-Status -Resp $missingVisitorId -Expected 400 -Msg "[auth-scoping] /ops/engagements should 400 when visitorId is missing (with valid key)"

# - With key and required query => 200
$withKey = Invoke-Api -Method GET -Url $opsUrlBase -Headers $headers
Assert-Status -Resp $withKey -Expected 200 -Msg "[auth-scoping] /ops/engagements should 200 with x-api-key + required query"

Write-Host "[assert-auth-scoping-ops] OK" -ForegroundColor Green
