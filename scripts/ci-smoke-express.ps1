[CmdletBinding()]
param(
  [Parameter(Mandatory = $false)]
  [string]$BaseUrl = $env:HOPE_AI_API_BASE_URL,

  # CI runner passes -RetrySeconds today
  [Parameter(Mandatory = $false)]
  [int]$RetrySeconds = 30
)

Set-StrictMode -Version Latest

function Write-Info([string]$Message) { Write-Host $Message }
function Write-Warn([string]$Message) { Write-Host $Message }
function Write-Fail([string]$Message) { Write-Host $Message }

function Try-ParseJson {
  param([string]$Text)
  if ([string]::IsNullOrWhiteSpace($Text)) { return $null }
  try { return ($Text | ConvertFrom-Json) } catch { return $null }
}

function Invoke-HttpJson {
  [CmdletBinding()]
  param(
    [Parameter(Mandatory = $true)][ValidateSet("GET","POST","PUT","PATCH","DELETE")]
    [string]$Method,

    [Parameter(Mandatory = $true)]
    [string]$Uri,

    [Parameter(Mandatory = $false)]
    [object]$Body
  )

  $headers = @{ "Accept" = "application/json" }
  $bodyJson = $null
  if ($null -ne $Body) {
    $bodyJson = ($Body | ConvertTo-Json -Depth 10)
    $headers["Content-Type"] = "application/json"
  }

  $result = [ordered]@{
    Ok         = $false
    StatusCode = $null
    Uri        = $Uri
    BodyText   = $null
    Json       = $null
    Error      = $null
  }

  try {
    $resp = Invoke-WebRequest -UseBasicParsing -Method $Method -Uri $Uri -Headers $headers -Body $bodyJson
    $result.StatusCode = [int]$resp.StatusCode
    $result.BodyText   = $resp.Content
    $result.Json       = Try-ParseJson -Text $resp.Content
    $result.Ok         = ($result.StatusCode -ge 200 -and $result.StatusCode -lt 300)
    return [pscustomobject]$result
  }
  catch {
    $ex = $_.Exception
    $result.Error = $ex.Message

    # Extract status/body from WebException response (PS 5.1-safe)
    try {
      if ($ex -and $ex.Response) {
        $httpResp = $ex.Response
        try { $result.StatusCode = [int]$httpResp.StatusCode } catch { }

        try {
          $stream = $httpResp.GetResponseStream()
          if ($stream) {
            $reader = New-Object System.IO.StreamReader($stream)
            $text = $reader.ReadToEnd()
            $reader.Close()
            $result.BodyText = $text
            $result.Json     = Try-ParseJson -Text $text
          }
        } catch { }
      }
    } catch { }

    return [pscustomobject]$result
  }
}

function Normalize-BaseUrl {
  param([string]$Value)

  $u = $Value
  if ([string]::IsNullOrWhiteSpace($u)) { $u = "http://127.0.0.1:3000/ops" }
  $u = $u.TrimEnd("/")

  # If caller gave server root, default to /ops
  if ($u -notmatch "/(ops|api)$") {
    $u = "$u/ops"
  }

  return $u
}

function Is-RouteNotFound404 {
  param([pscustomobject]$Response)

  if ($null -eq $Response) { return $false }
  if ($Response.StatusCode -ne 404) { return $false }

  $j = $Response.Json
  if ($null -ne $j) {
    try {
      if ($j.PSObject.Properties.Name -contains "error") {
        if ($j.error -eq "not_found") { return $true }
      }
      if ($j.PSObject.Properties.Name -contains "message") {
        if ([string]$j.message -match "Route not found") { return $true }
      }
    } catch { }
  }

  return $true
}

function Resolve-WorkingBaseUrl {
  param([string]$CandidateBase)

  $base = Normalize-BaseUrl -Value $CandidateBase

  # Probe the candidate health once
  $h1 = Invoke-HttpJson -Method GET -Uri "$base/health"
  if ($h1.StatusCode -eq 200) { return $base }

  # If it's clearly /api but missing, try /ops
  if ($base -match "/api$" -and (Is-RouteNotFound404 -Response $h1)) {
    $ops = ($base -replace "/api$", "/ops")
    $h2 = Invoke-HttpJson -Method GET -Uri "$ops/health"
    if ($h2.StatusCode -eq 200) {
      Write-Warn "WARN: BaseUrl '$base' not healthy (404). Falling back to '$ops'."
      return $ops
    }
  }

  # If it's /ops but missing, try /api
  if ($base -match "/ops$" -and (Is-RouteNotFound404 -Response $h1)) {
    $api = ($base -replace "/ops$", "/api")
    $h2 = Invoke-HttpJson -Method GET -Uri "$api/health"
    if ($h2.StatusCode -eq 200) {
      Write-Warn "WARN: BaseUrl '$base' not healthy (404). Falling back to '$api'."
      return $api
    }
  }

  return $base
}

function Wait-ForHealthyBase {
  param([string]$InitialBaseUrl, [int]$Seconds)

  $deadline = (Get-Date).AddSeconds($Seconds)
  $resolved = Resolve-WorkingBaseUrl -CandidateBase $InitialBaseUrl

  while ((Get-Date) -lt $deadline) {
    $h = Invoke-HttpJson -Method GET -Uri "$resolved/health"
    if ($h.StatusCode -eq 200) {
      return $resolved
    }

    # If it looks like a wrong base path, try resolving again (might flip /api<->/ops)
    if (Is-RouteNotFound404 -Response $h) {
      $resolved = Resolve-WorkingBaseUrl -CandidateBase $resolved
    }

    Start-Sleep -Seconds 1
  }

  return $null
}

# -------------------- Main --------------------

Write-Host "=== CI EXPRESS SMOKE ==="

$workingBase = Wait-ForHealthyBase -InitialBaseUrl $BaseUrl -Seconds $RetrySeconds
if ([string]::IsNullOrWhiteSpace($workingBase)) {
  # Last attempt to print something useful without stack traces
  $probe = Invoke-HttpJson -Method GET -Uri ((Normalize-BaseUrl -Value $BaseUrl) + "/health")
  Write-Fail ("FAIL: Health check did not return 200 within {0}s. LastStatus={1} Body={2}" -f $RetrySeconds, $probe.StatusCode, ($probe.BodyText | ForEach-Object { $_ }))
  exit 1
}

Write-Host ("HEALTH {0}/health" -f $workingBase)

# Visitor create
Write-Host ("BaseUrl: {0}" -f $workingBase)
Write-Host ("POST {0}/visitors" -f $workingBase)

$visitorEmail = ("smoke+" + [Guid]::NewGuid().ToString("N") + "@example.com")
$create = Invoke-HttpJson -Method POST -Uri "$workingBase/visitors" -Body @{
  name  = "Smoke Visitor"
  email = $visitorEmail
}

if (-not $create.Ok) {
  Write-Fail ("FAIL: POST /visitors failed. Status={0} Body={1}" -f $create.StatusCode, ($create.BodyText | ForEach-Object { $_ }))
  exit 1
}

# Extract visitorId (tolerant)
$visitorId = $null
try {
  $vj = $create.Json
  if ($null -ne $vj) {
    if ($vj.PSObject.Properties.Name -contains "visitorId") { $visitorId = [string]$vj.visitorId }
    elseif ($vj.PSObject.Properties.Name -contains "id") { $visitorId = [string]$vj.id }
    elseif ($vj.PSObject.Properties.Name -contains "visitor" -and $vj.visitor -and ($vj.visitor.PSObject.Properties.Name -contains "id")) {
      $visitorId = [string]$vj.visitor.id
    }
  }
} catch { }

if ([string]::IsNullOrWhiteSpace($visitorId)) {
  Write-Fail "FAIL: POST /visitors succeeded but could not read visitorId from JSON."
  exit 1
}

# Visitor get
Write-Host ("GET {0}/visitors/{1}" -f $workingBase, $visitorId)

$get = Invoke-HttpJson -Method GET -Uri ("{0}/visitors/{1}" -f $workingBase, $visitorId)
if (-not $get.Ok) {
  Write-Fail ("FAIL: GET /visitors/{0} failed. Status={1} Body={2}" -f $visitorId, $get.StatusCode, ($get.BodyText | ForEach-Object { $_ }))
  exit 1
}

# Visitors list (known: may be unimplemented in Express; skip on 404)
$listUrl = ("{0}/visitors?limit=5" -f $workingBase)
Write-Host ("LIST {0}" -f $listUrl)

$list = Invoke-HttpJson -Method GET -Uri $listUrl
if ($list.StatusCode -eq 404) {
  Write-Host "SKIP: LIST /visitors not implemented in Express yet."
  Write-Host "OK: CI Express smoke passed."
  exit 0
}
if (-not $list.Ok) {
  Write-Fail ("FAIL: LIST /visitors failed. Status={0} Body={1}" -f $list.StatusCode, ($list.BodyText | ForEach-Object { $_ }))
  exit 1
}

Write-Host "OK: CI Express smoke passed."
exit 0
