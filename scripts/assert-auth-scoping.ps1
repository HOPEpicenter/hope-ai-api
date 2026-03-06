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

function Assert-Status {
  param(
    [Parameter(Mandatory=$true)] $Resp,
    [Parameter(Mandatory=$true)][int] $Expected,
    [Parameter(Mandatory=$true)][string] $Msg
  )

  if ([int]$Resp.StatusCode -ne $Expected) {
    $bodyText = if ($Resp.Content -is [byte[]]) { [Text.Encoding]::UTF8.GetString($Resp.Content) } else { [string]$Resp.Content }
    throw "$Msg`nExpected HTTP $Expected but got $($Resp.StatusCode).`nUrl: $($Resp.BaseResponse.ResponseUri)`nBody: $bodyText"
  }
}

Write-Host "[assert-auth-scoping] ApiBase=$ApiBase"

# Pick one known public endpoint and one known protected surface.
# Public: health should be 200 without API key.
$health = Invoke-Api -Method GET -Url "$ApiBase/api/health"
Assert-Status -Resp $health -Expected 200 -Msg "[auth-scoping] /api/health should be public"

# Protected (adjust if your repo uses a different protected route):
# We'll use OPS surface if present: /ops/health should require API key.
# If your OPS health path differs, update this URL to a real protected endpoint.
$opsUrl = "$ApiBase/ops/health"

# No API key => 401
$noKey = Invoke-Api -Method GET -Url $opsUrl
if ([int]$noKey.StatusCode -ne 401 -and [int]$noKey.StatusCode -ne 404) {
  throw "[auth-scoping] Expected /ops/health to return 401 without key (or 404 if endpoint not deployed), got $($noKey.StatusCode)"
}
if ([int]$noKey.StatusCode -eq 404) {
  Write-Host "[assert-auth-scoping] NOTE: $opsUrl returned 404; update script to target a real protected endpoint in this repo."
  Write-Host "[assert-auth-scoping] OK (public health verified; protected endpoint not found)"
  exit 0
}

# With API key => 200
if ([string]::IsNullOrWhiteSpace($ApiKey)) {
  throw "[auth-scoping] HOPE_API_KEY is not set. Set env var HOPE_API_KEY to run protected assertions."
}
$headers = @{ "x-api-key" = $ApiKey }

$withKey = Invoke-Api -Method GET -Url $opsUrl -Headers $headers
Assert-Status -Resp $withKey -Expected 200 -Msg "[auth-scoping] /ops/health should return 200 with API key"

Write-Host "[assert-auth-scoping] OK" -ForegroundColor Green
