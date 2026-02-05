param(
  [Parameter(Mandatory=$true)]
  [string]$BaseUrl
)

$ErrorActionPreference = "Stop"

function Assert-True([bool]$cond, [string]$msg) {
  if (-not $cond) { throw "ASSERT FAIL: $msg" }
}

function Invoke-ExpectStatus {
  param(
    [Parameter(Mandatory=$true)][ValidateSet("GET","POST")][string]$Method,
    [Parameter(Mandatory=$true)][string]$Url,
    [hashtable]$Headers = @{},
    [object]$Body = $null,
    [int]$ExpectedStatus
  )

  try {
    if ($Method -eq "GET") {
      $resp = Invoke-WebRequest -Method GET -Uri $Url -Headers $Headers -UseBasicParsing
    } else {
      $json = $null
      if ($null -ne $Body) { $json = ($Body | ConvertTo-Json -Depth 10) }
      $resp = Invoke-WebRequest -Method POST -Uri $Url -Headers $Headers -ContentType "application/json" -Body $json -UseBasicParsing
    }

    Assert-True ($resp.StatusCode -eq $ExpectedStatus) "Expected $ExpectedStatus but got $($resp.StatusCode) for $Method $Url"
    return $resp
  } catch {
    # Many failures are HttpResponseException w/ a response object we can inspect
    $ex = $_.Exception
    $status = $null
    $ctype  = $null

    if ($ex.Response) {
      try {
        $status = [int]$ex.Response.StatusCode
      } catch {}
      try {
        $ctype = $ex.Response.Content.Headers.ContentType.ToString()
      } catch {}
    }

    Assert-True ($status -eq $ExpectedStatus) "Expected $ExpectedStatus but got $status for $Method $Url (ContentType=$ctype). $_"
    return $null
  }
}

Write-Host "=== AUTH SCOPING SMOKE ==="
Write-Host "BaseUrl: $BaseUrl"

# Public endpoints MUST NOT require an API key
Invoke-ExpectStatus -Method GET -Url "$BaseUrl/health" -ExpectedStatus 200 | Out-Null

# Protected roots (must require key)
$protected = @(
  "$BaseUrl/formation/timeline",
  "$BaseUrl/integration/timeline",
  "$BaseUrl/legacy/export"
)

foreach ($u in $protected) {
  Invoke-ExpectStatus -Method GET -Url $u -ExpectedStatus 401 | Out-Null
}

# POST formation/events must also require key
Invoke-ExpectStatus -Method POST -Url "$BaseUrl/formation/events" -Body @{} -ExpectedStatus 401 | Out-Null

# With key present, we should get *past auth* and reach validation (usually 400)
# That proves auth is correctly scoped and functioning.
$apiKey = $env:HOPE_API_KEY
if ([string]::IsNullOrWhiteSpace($apiKey)) {
  throw "HOPE_API_KEY is not set in environment; CI should provide this. Set it locally to run auth-scope checks."
}

$h = @{ "x-api-key" = $apiKey }

foreach ($u in $protected) {
  Invoke-ExpectStatus -Method GET -Url $u -Headers $h -ExpectedStatus 400 | Out-Null
}

Invoke-ExpectStatus -Method POST -Url "$BaseUrl/formation/events" -Headers $h -Body @{} -ExpectedStatus 400 | Out-Null

Write-Host "OK: Auth scoping assertions passed (public endpoints unaffected; protected endpoints require API key)."
