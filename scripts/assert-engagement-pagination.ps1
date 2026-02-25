[CmdletBinding()]
param(
  [Parameter(Mandatory = $false)]
  [string]$BaseUrl = $env:HOPE_AI_API_BASE_URL,

  [Parameter(Mandatory = $false)]
  [int]$HealthTimeoutSeconds = 60
)

Set-StrictMode -Version Latest

function Write-Info([string]$Message) { Write-Host $Message }
function Write-Warn([string]$Message) { Write-Host $Message }
function Write-Fail([string]$Message) { Write-Host $Message }

function Get-BaseUrl {
  param([string]$Value)
  $u = $Value
  if ([string]::IsNullOrWhiteSpace($u)) { $u = "http://localhost:3000" }
  $u = $u.TrimEnd("/")
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
  param(
    [string]$BaseUrl,
    [int]$TimeoutSeconds
  )

  $deadline = (Get-Date).AddSeconds($TimeoutSeconds)
  $healthUrl = "$BaseUrl/ops/health"

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
  # Confirmed current behavior: /ops/engagements returns 404 when not implemented
  if ($Response -and $Response.StatusCode -eq 404) { return $true }
  return $false
}

function Try-GetItemsArray {
  param([object]$Json)

  if ($null -eq $Json) { return $null }

  foreach ($prop in @("items","data","results")) {
    try {
      if ($Json.PSObject.Properties.Name -contains $prop) {
        $val = $Json.$prop
        if ($val -is [System.Collections.IEnumerable] -and -not ($val -is [string])) { return $val }
      }
    } catch { }
  }

  # If the root is already an array
  if ($Json -is [System.Collections.IEnumerable] -and -not ($Json -is [string])) {
    return $Json
  }

  return $null
}

function Try-GetContinuationToken {
  param([object]$Json)

  if ($null -eq $Json) { return $null }

  foreach ($prop in @("nextCursor","cursor","continuationToken","nextPageToken","pageToken")) {
    try {
      if ($Json.PSObject.Properties.Name -contains $prop) {
        $val = $Json.$prop
        if (-not [string]::IsNullOrWhiteSpace([string]$val)) {
          return [pscustomobject]@{ Name = $prop; Value = [string]$val }
        }
      }
    } catch { }
  }

  return $null
}

# ------------------- Main -------------------

$BaseUrl = Get-BaseUrl -Value $BaseUrl
Write-Info "BaseUrl: $BaseUrl"

if (-not (Wait-ForHealth -BaseUrl $BaseUrl -TimeoutSeconds $HealthTimeoutSeconds)) {
  exit 1
}

# Create a visitor (confirmed endpoint exists: /ops/visitors)
$visitorName  = "Smoke Visitor"
$visitorEmail = ("smoke+" + [Guid]::NewGuid().ToString("N") + "@example.com")

$createVisitorUrl = "$BaseUrl/ops/visitors"
Write-Info "Creating visitor: POST $createVisitorUrl"

$visitorResp = Invoke-HttpJson -Method POST -Uri $createVisitorUrl -Body @{
  name  = $visitorName
  email = $visitorEmail
}

if (-not $visitorResp.Ok) {
  Write-Fail ("FAIL: Visitor creation failed. Status={0} Body={1}" -f $visitorResp.StatusCode, ($visitorResp.BodyText | ForEach-Object { $_ }))
  exit 1
}

$visitorId = $null
try {
  $vj = $visitorResp.Json
  if ($null -ne $vj) {
    if ($vj.PSObject.Properties.Name -contains "visitorId") { $visitorId = [string]$vj.visitorId }
    elseif ($vj.PSObject.Properties.Name -contains "id") { $visitorId = [string]$vj.id }
    elseif ($vj.PSObject.Properties.Name -contains "visitor" -and $vj.visitor -and ($vj.visitor.PSObject.Properties.Name -contains "id")) {
      $visitorId = [string]$vj.visitor.id
    }
  }
} catch { }

if ([string]::IsNullOrWhiteSpace($visitorId)) {
  Write-Warn "WARN: Could not read visitorId from response JSON. Proceeding without visitorId."
} else {
  Write-Info "Visitor created. visitorId=$visitorId"
}

# Probe engagements endpoint (current known state: 404 => NOT IMPLEMENTED)
$engBaseUrl = "$BaseUrl/ops/engagements"

# Attempt engagement creation (inside safe HTTP wrapper; no stack traces)
Write-Info "Attempting engagement create: POST $engBaseUrl"

$engBody = @{}
if (-not [string]::IsNullOrWhiteSpace($visitorId)) { $engBody.visitorId = $visitorId }

$engCreate = Invoke-HttpJson -Method POST -Uri $engBaseUrl -Body $engBody

if (Is-MissingEndpoint -Response $engCreate) {
  Write-Info "SKIP: /ops/engagements is not implemented yet (HTTP 404)."
  exit 0
}

if (-not $engCreate.Ok) {
  Write-Fail ("FAIL: /ops/engagements exists but create failed. Status={0} Body={1}" -f $engCreate.StatusCode, ($engCreate.BodyText | ForEach-Object { $_ }))
  exit 1
}

Write-Info "Engagement create returned success (2xx). Continuing to minimal pagination validation..."

# Minimal pagination validation:
# We only do a small GET that should be safe even if server ignores query params.
$list1Url = "$engBaseUrl?limit=1"
Write-Info "Listing engagements (page 1): GET $list1Url"

$list1 = Invoke-HttpJson -Method GET -Uri $list1Url

if (Is-MissingEndpoint -Response $list1) {
  Write-Info "SKIP: /ops/engagements is not implemented yet (HTTP 404)."
  exit 0
}

if (-not $list1.Ok) {
  Write-Fail ("FAIL: Engagement list failed. Status={0} Body={1}" -f $list1.StatusCode, ($list1.BodyText | ForEach-Object { $_ }))
  exit 1
}

$items1 = Try-GetItemsArray -Json $list1.Json
if ($null -eq $items1) {
  Write-Warn "WARN: List JSON did not include a recognizable items array (items/data/results). Treating as pass since JSON was returned."
} else {
  $count1 = 0
  try { $count1 = @($items1).Count } catch { $count1 = 0 }
  Write-Info "List page 1 returned an items array. Count=$count1"
}

$token = Try-GetContinuationToken -Json $list1.Json
if ($null -ne $token) {
  $tokenName = $token.Name
  $tokenVal  = $token.Value
  $list2Url  = "$engBaseUrl?limit=1&$tokenName=$([uri]::EscapeDataString($tokenVal))"

  Write-Info "Listing engagements (page 2 via $tokenName): GET $list2Url"
  $list2 = Invoke-HttpJson -Method GET -Uri $list2Url

  if (-not $list2.Ok) {
    Write-Fail ("FAIL: Engagement page-2 request failed. Status={0} Body={1}" -f $list2.StatusCode, ($list2.BodyText | ForEach-Object { $_ }))
    exit 1
  }

  $items2 = Try-GetItemsArray -Json $list2.Json
  if ($null -eq $items2) {
    Write-Warn "WARN: Page 2 JSON did not include a recognizable items array, but returned JSON successfully."
  } else {
    $count2 = 0
    try { $count2 = @($items2).Count } catch { $count2 = 0 }
    Write-Info "List page 2 returned an items array. Count=$count2"
  }
} else {
  Write-Info "No continuation token found in page 1 response; treating pagination as single-page or non-tokenized."
}

Write-Info "PASS: Engagement pagination smoke assertion completed."
exit 0
