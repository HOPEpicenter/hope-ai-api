param(
  [Parameter(Mandatory=$true)]
  [string]$ApiBaseUrl,

  [Parameter(Mandatory=$false)]
  [int]$Limit = 10
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

function Assert-True([bool]$cond, [string]$msg) {
  if (-not $cond) { throw "ASSERT FAIL: $msg" }
}

function Normalize-ApiBaseUrl([string]$u) {
  if ([string]::IsNullOrWhiteSpace($u)) { throw "ApiBaseUrl is required" }
  $u = $u.TrimEnd("/")
  if ($u -notmatch "/api$") { $u = "$u/api" }
  return $u
}

function Try-ParseJson([string]$Text) {
  if ([string]::IsNullOrWhiteSpace($Text)) { return $null }
  try { return ($Text | ConvertFrom-Json) } catch { return $null }
}

function Invoke-HttpJson {
  param(
    [Parameter(Mandatory=$true)][ValidateSet("GET","POST")][string]$Method,
    [Parameter(Mandatory=$true)][string]$Uri,
    [hashtable]$Headers = @{},
    [object]$Body = $null
  )

  $h = @{}
  $h["Accept"] = "application/json"
  foreach ($k in $Headers.Keys) { $h[$k] = $Headers[$k] }

  $bodyJson = $null
  if ($null -ne $Body) {
    $bodyJson = ($Body | ConvertTo-Json -Depth 10)
    $h["Content-Type"] = "application/json"
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
    if ($Method -eq "GET") {
      $resp = Invoke-WebRequest -UseBasicParsing -Method GET -Uri $Uri -Headers $h
    } else {
      $resp = Invoke-WebRequest -UseBasicParsing -Method POST -Uri $Uri -Headers $h -Body $bodyJson
    }
    $result.StatusCode = [int]$resp.StatusCode
    $result.BodyText   = $resp.Content
    $result.Json       = Try-ParseJson -Text $resp.Content
    $result.Ok         = ($result.StatusCode -ge 200 -and $result.StatusCode -lt 300)
    return [pscustomobject]$result
  } catch {
    $ex = $_.Exception
    $result.Error = $ex.Message

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

function Make-StableKey([pscustomobject]$evt) {
  return ("{0}|{1}" -f [string]$evt.occurredAt, [string]$evt.eventId)
}

# -------------------- Main --------------------

Write-Host "=== INTEGRATION + LEGACY ASSERT ==="

$api = Normalize-ApiBaseUrl $ApiBaseUrl
Write-Host "ApiBaseUrl: $api"

# /api/health must be public
$h = Invoke-HttpJson -Method GET -Uri "$api/health"
Assert-True ($h.StatusCode -eq 200) "Expected 200 for GET $api/health but got $($h.StatusCode). Body=$($h.BodyText)"

# Need key for protected endpoints
$apiKey = $env:HOPE_API_KEY
if ([string]::IsNullOrWhiteSpace($apiKey)) {
  throw "HOPE_API_KEY is not set in environment; CI should provide this."
}
$auth = @{ "x-api-key" = $apiKey }

# Create a visitor (public) to use as the probe id
$visitorEmail = ("phase7+" + [Guid]::NewGuid().ToString("N") + "@example.com")
$create = Invoke-HttpJson -Method POST -Uri "$api/visitors" -Body @{
  name  = "Phase7 Visitor"
  email = $visitorEmail
}

Assert-True ($create.Ok) "POST /api/visitors failed. Status=$($create.StatusCode) Body=$($create.BodyText)"

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

Assert-True (-not [string]::IsNullOrWhiteSpace($visitorId)) "Could not extract visitorId from POST /api/visitors response."

# ---- Integration timeline ----
$limit = [Math]::Max(1, [Math]::Min($Limit, 50))
$itUrl = "$api/integration/timeline?visitorId=$visitorId&limit=$limit"
Write-Host "GET $itUrl"

$it = Invoke-HttpJson -Method GET -Uri $itUrl -Headers $auth
Assert-True ($it.StatusCode -eq 200) "Expected 200 for integration timeline with API key; got $($it.StatusCode). Body=$($it.BodyText)"

Assert-True ($null -ne $it.Json) "Integration timeline response was not JSON."

# Accept either Phase 4 shape { ok, items, nextCursor } or legacy shape { v, visitorId, items, nextCursor }
$items = $null

if ($it.Json.PSObject.Properties.Name -contains "ok") {
  Assert-True ($it.Json.ok -eq $true) "Integration timeline expected ok=true."
  Assert-True ($it.Json.PSObject.Properties.Name -contains "items") "Integration timeline missing 'items'."
  $items = $it.Json.items
}
elseif ($it.Json.PSObject.Properties.Name -contains "v") {
  Assert-True ($it.Json.v -eq 1) "Integration timeline expected v=1 but got v=$($it.Json.v)"
  Assert-True ([string]$it.Json.visitorId -eq $visitorId) "Integration timeline visitorId mismatch."
  $items = $it.Json.items
}
else {
  throw "ASSERT FAIL: Integration timeline unexpected response shape (missing ok or v). Body=$($it.BodyText)"
}

# stable ordering (only assert if there are 2+ items)
if ($null -ne $items -and $items.Count -ge 2) {
  for ($i = 1; $i -lt $items.Count; $i++) {
    $prev = Make-StableKey $items[$i-1]
    $curr = Make-StableKey $items[$i]
    Assert-True ($prev -ge $curr) "Integration items not sorted (expected newest-first). prev=$prev curr=$curr"
  }
}

# ---- Legacy export ----
$leUrl = "$api/legacy/export?visitorId=$visitorId&limit=$limit"
Write-Host "GET $leUrl"

$le = Invoke-HttpJson -Method GET -Uri $leUrl -Headers $auth
Assert-True ($le.StatusCode -eq 200) "Expected 200 for legacy export with API key; got $($le.StatusCode). Body=$($le.BodyText)"

Assert-True ($null -ne $le.Json) "Legacy export response was not JSON."
Assert-True ($le.Json.v -eq 1) "Legacy export expected v=1 but got v=$($le.Json.v)"
Assert-True ([string]$le.Json.visitorId -eq $visitorId) "Legacy export visitorId mismatch."

# required sections exist (shape lock)
Assert-True ($le.Json.PSObject.Properties.Name -contains "engagement") "Legacy export missing 'engagement' section"
Assert-True ($le.Json.PSObject.Properties.Name -contains "formation")  "Legacy export missing 'formation' section"
Assert-True ($le.Json.PSObject.Properties.Name -contains "integration") "Legacy export missing 'integration' section"

Assert-True ($le.Json.engagement.v -eq 1) "Legacy export engagement.v expected 1"
Assert-True ($le.Json.formation.v -eq 1)  "Legacy export formation.v expected 1"
Assert-True ($le.Json.integration.v -eq 1) "Legacy export integration.v expected 1"

Write-Host "OK: Integration timeline + Legacy export assertions passed."

