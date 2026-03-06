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
    Method            = $Method
    Uri               = $Url
    Headers           = $Headers
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
    [Parameter(Mandatory=$true)][string] $Msg,
    [Parameter(Mandatory=$true)][string] $Url
  )

  if ([int]$Resp.StatusCode -ne $Expected) {
    $bodyText = Get-BodyText $Resp
    throw "$Msg`nExpected HTTP $Expected but got $($Resp.StatusCode).`nUrl: $Url`nBody: $bodyText"
  }
}

function Assert-StatusIn {
  param(
    [Parameter(Mandatory=$true)] $Resp,
    [Parameter(Mandatory=$true)][int[]] $Expected,
    [Parameter(Mandatory=$true)][string] $Msg,
    [Parameter(Mandatory=$true)][string] $Url
  )

  $code = [int]$Resp.StatusCode
  if ($Expected -notcontains $code) {
    $bodyText = Get-BodyText $Resp
    throw "$Msg`nExpected HTTP one of: $($Expected -join ', ') but got $code.`nUrl: $Url`nBody: $bodyText"
  }
}

Write-Host "[assert-auth-scoping] ApiBase=$ApiBase"

# 1) Public endpoint: /api/health should be 200 without x-api-key
$healthUrl = "$ApiBase/api/health"
$health = Invoke-Api -Method GET -Url $healthUrl
Assert-Status -Resp $health -Expected 200 -Msg "[auth-scoping] /api/health should be public" -Url $healthUrl

# 2) Public create visitor should succeed (200 reused or 201 created)
$createUrl = "$ApiBase/api/visitors"
$createBody = @{
  name  = "Auth Scoping Smoke"
  email = "auth-scoping+$([guid]::NewGuid().ToString('N'))@example.com"
} | ConvertTo-Json

$create = Invoke-Api -Method POST -Url $createUrl -Body $createBody
Assert-StatusIn -Resp $create -Expected @(200, 201) -Msg "[auth-scoping] POST /api/visitors should succeed (200 or 201)" -Url $createUrl

# 3) Protected endpoint (deployed Function): /api/_protected/ping
# Missing key => 401
$protectedOkUrl = "$ApiBase/api/_protected/ping?limit=1"
$noKey = Invoke-Api -Method GET -Url $protectedOkUrl
Assert-Status -Resp $noKey -Expected 401 -Msg "[auth-scoping] Protected endpoint should require x-api-key (missing key => 401)" -Url $protectedOkUrl

# With key => proceed
if ([string]::IsNullOrWhiteSpace($ApiKey)) {
  throw "[auth-scoping] HOPE_API_KEY is not set. Set env var HOPE_API_KEY to run protected assertions."
}
$headers = @{ "x-api-key" = $ApiKey }

# With key but invalid query => 400
$protectedBadUrl = "$ApiBase/api/_protected/ping?limit=abc"
$badReq = Invoke-Api -Method GET -Url $protectedBadUrl -Headers $headers
Assert-Status -Resp $badReq -Expected 400 -Msg "[auth-scoping] Protected endpoint should 400 on invalid query (with valid key)" -Url $protectedBadUrl

# With key and valid query => 200
$withKey = Invoke-Api -Method GET -Url $protectedOkUrl -Headers $headers
Assert-Status -Resp $withKey -Expected 200 -Msg "[auth-scoping] Protected endpoint should 200 with valid x-api-key + valid query" -Url $protectedOkUrl

Write-Host "[assert-auth-scoping] OK" -ForegroundColor Green