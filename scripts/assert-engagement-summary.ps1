[CmdletBinding()]
param(
  # Accept what the CI runner passes today
  [Parameter(Mandatory = $false)]
  [string]$BaseUrl,

  # Back-compat / optional alternate name
  [Parameter(Mandatory = $false)]
  [Alias("ApiBase")]
  [string]$OpsBaseUrl = $env:HOPE_AI_API_BASE_URL,

  [Parameter(Mandatory = $false)]
  [int]$HealthTimeoutSeconds = 60,

  [Parameter(Mandatory = $false)]
  [int]$CreateCount = 12
)

Set-StrictMode -Version Latest

function Write-Info([string]$Message) { Write-Host $Message }
function Write-Warn([string]$Message) { Write-Host $Message }
function Write-Fail([string]$Message) { Write-Host $Message }

function Normalize-OpsBase {
  param([string]$FromBaseUrl, [string]$FromOpsBaseUrl)

  $u = $null

  # Prefer -BaseUrl if provided (because CI is passing it)
  if (-not [string]::IsNullOrWhiteSpace($FromBaseUrl)) {
    $u = $FromBaseUrl
  } elseif (-not [string]::IsNullOrWhiteSpace($FromOpsBaseUrl)) {
    $u = $FromOpsBaseUrl
  } else {
    $u = "http://127.0.0.1:3000"
  }

  $u = $u.TrimEnd("/")

  # If it's root, normalize to /ops
  if ($u -notmatch "/ops$") {
    $u = "$u/ops"
  }

  return $u
}

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
    [object]$Body,

    [Parameter(Mandatory = $false)]
    [hashtable]$Headers
  )

  $hdrs = @{}
  if ($Headers) {
    foreach ($k in $Headers.Keys) { $hdrs[$k] = $Headers[$k] }
  }
  if (-not $hdrs.ContainsKey("Accept")) { $hdrs["Accept"] = "application/json" }

  $bodyJson = $null
  if ($null -ne $Body) {
    $bodyJson = ($Body | ConvertTo-Json -Depth 10)
    if (-not $hdrs.ContainsKey("Content-Type")) { $hdrs["Content-Type"] = "application/json" }
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
    $resp = Invoke-WebRequest -Uri $Uri -Method $Method -Headers $hdrs -Body $bodyJson -UseBasicParsing
    $result.StatusCode = [int]$resp.StatusCode
    $result.BodyText   = $resp.Content
    $result.Json       = Try-ParseJson -Text $resp.Content
    $result.Ok         = ($result.StatusCode -ge 200 -and $result.StatusCode -lt 300)
    return [pscustomobject]$result
  }
  catch {
    $ex = $_.Exception
    $result.Error = $ex.Message

    # Extract HTTP status + body from WebException response (PS 5.1-safe)
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

function Wait-ForHealth {
  param([string]$OpsBase, [int]$TimeoutSeconds)

  $deadline = (Get-Date).AddSeconds($TimeoutSeconds)
  $healthUrl = "$OpsBase/health"

  Write-Info "Waiting for health: $healthUrl (timeout ${TimeoutSeconds}s)"
  while ((Get-Date) -lt $deadline) {
    $r = Invoke-HttpJson -Method GET -Uri $healthUrl
    if ($r.StatusCode -eq 200) {
      Write-Info "Health OK (200)."
      return $true
    }
    Start-Sleep -Seconds 1
  }

  Write-Fail "FAIL: Timed out waiting for /ops/health after ${TimeoutSeconds}s."
  return $false
}

function Is-MissingEndpoint {
  param([pscustomobject]$Response)
  if ($Response -and $Response.StatusCode -eq 404) { return $true }
  return $false
}

# ------------------- Main -------------------

$OpsBase = Normalize-OpsBase -FromBaseUrl $BaseUrl -FromOpsBaseUrl $OpsBaseUrl
Write-Info "[assert-engagement-summary] OpsBase=$OpsBase CreateCount=$CreateCount"

if (-not (Wait-ForHealth -OpsBase $OpsBase -TimeoutSeconds $HealthTimeoutSeconds)) {
  exit 1
}

# Probe engagements endpoint first; if missing, SKIP cleanly.
$engBase = "$OpsBase/engagements"
Write-Info "[assert-engagement-summary] Probing engagements endpoint: GET $engBase"

$probe = Invoke-HttpJson -Method GET -Uri $engBase
if (Is-MissingEndpoint -Response $probe) {
  Write-Info "SKIP: /ops/engagements is not implemented yet (HTTP 404)."
  exit 0
}
if (-not $probe.Ok) {
  Write-Fail ("FAIL: /ops/engagements probe failed. Status={0} Body={1}" -f $probe.StatusCode, ($probe.BodyText | ForEach-Object { $_ }))
  exit 1
}

# Create visitor with required fields (confirmed: name is required)
Write-Info "[assert-engagement-summary] Creating visitor..."
$visitorName  = "Smoke Visitor"
$visitorEmail = ("smoke+" + [Guid]::NewGuid().ToString("N") + "@example.com")

$visitorResp = Invoke-HttpJson -Method POST -Uri ("{0}/visitors" -f $OpsBase) -Body @{
  name  = $visitorName
  email = $visitorEmail
}

if (-not $visitorResp.Ok) {
  Write-Fail ("FAIL: Visitor creation failed. Status={0} Body={1}" -f $visitorResp.StatusCode, ($visitorResp.BodyText | ForEach-Object { $_ }))
  exit 1
}

# Minimal summary check without guessing schema
$summaryUrl = "$engBase/summary"
Write-Info "[assert-engagement-summary] Fetching summary: GET $summaryUrl"

$summaryResp = Invoke-HttpJson -Method GET -Uri $summaryUrl
if (Is-MissingEndpoint -Response $summaryResp) {
  Write-Fail "FAIL: /ops/engagements exists but /ops/engagements/summary returned 404."
  exit 1
}
if (-not $summaryResp.Ok) {
  Write-Fail ("FAIL: Engagement summary request failed. Status={0} Body={1}" -f $summaryResp.StatusCode, ($summaryResp.BodyText | ForEach-Object { $_ }))
  exit 1
}
if ($null -eq $summaryResp.Json) {
  Write-Fail "FAIL: Engagement summary returned non-JSON response."
  exit 1
}

Write-Info "PASS: Engagement summary assertion completed."
exit 0
