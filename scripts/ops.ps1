# scripts/ops.ps1
# Ops helpers (PowerShell 5.1 safe). Provides OpsRequest + convenience wrappers.

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

function OpsUrl {
  param(
    [Parameter(Mandatory = $true)][string]$BaseUrl,
    [Parameter(Mandatory = $true)][string]$Path
  )
  $b = $BaseUrl.TrimEnd("/")
  $p = $Path
  if (-not $p.StartsWith("/")) { $p = "/" + $p }
  return $b + $p
}

function Read-ResponseBodyText {
  param([Parameter(Mandatory = $true)]$WebResponse)

  try {
    $stream = $WebResponse.GetResponseStream()
    if (-not $stream) { return $null }

    $reader = $null
    try {
      $reader = New-Object System.IO.StreamReader($stream)
      return $reader.ReadToEnd()
    }
    finally {
      try { if ($reader) { $reader.Dispose() } } catch { }
      try { $stream.Dispose() } catch { }
    }
  }
  catch {
    return $null
  }
}

function OpsRequest {
  [CmdletBinding()]
  param(
    [Parameter(Mandatory = $true)][string]$BaseUrl,
    [Parameter(Mandatory = $true)][ValidateSet("GET","POST","PUT","PATCH","DELETE")][string]$Method,
    [Parameter(Mandatory = $true)][string]$Path,
    [object]$Body = $null,
    [int]$ExpectStatus = 0,
    [hashtable]$Headers = $null,
    [int]$TimeoutSec = 30
  )

  $uri = OpsUrl -BaseUrl $BaseUrl -Path $Path

  $reqHeaders = @{}
  if ($Headers) {
    foreach ($k in $Headers.Keys) { $reqHeaders[$k] = $Headers[$k] }
  }
  if (-not $reqHeaders.ContainsKey("accept")) { $reqHeaders["accept"] = "application/json" }

  $json = $null
  if ($null -ne $Body) {
    $json = ($Body | ConvertTo-Json -Depth 20 -Compress)
    if (-not $reqHeaders.ContainsKey("content-type")) { $reqHeaders["content-type"] = "application/json" }
  }

  $status = $null
  $text = $null
  $parsed = $null
  $outHeaders = $null

  try {
    if ($null -ne $json) {
      $resp = Invoke-WebRequest -Uri $uri -Method $Method -Headers $reqHeaders -Body $json -UseBasicParsing -TimeoutSec $TimeoutSec -ErrorAction Stop
    } else {
      $resp = Invoke-WebRequest -Uri $uri -Method $Method -Headers $reqHeaders -UseBasicParsing -TimeoutSec $TimeoutSec -ErrorAction Stop
    }

    $status = [int]$resp.StatusCode
    $text = $resp.Content
    $outHeaders = $resp.Headers
  }
  catch {
    # capture non-2xx responses with body (PS 5.1 safe)
    $we = $_.Exception
    $r = $we.Response

    if ($r -and $r.StatusCode) {
      $status = [int]$r.StatusCode
      try { $outHeaders = $r.Headers } catch { $outHeaders = $null }

      # Prefer ErrorDetails.Message in PS 5.1 (stream may be empty/consumed)
      try {
        if ($_.ErrorDetails -and $_.ErrorDetails.Message) {
          $text = $_.ErrorDetails.Message
        }
      } catch { }

      # Fallback: try response stream
      if (-not $text) {
        $text = Read-ResponseBodyText -WebResponse $r
      }
    } else {
      throw
    }
  }

  if ($null -ne $text -and $text.Trim().Length -gt 0) {
    try { $parsed = $text | ConvertFrom-Json } catch { $parsed = $null }
  }

  if ($ExpectStatus -ne 0) {
    if ($status -ne $ExpectStatus) {
      throw ("Expected HTTP {0} but got {1} for {2} {3}. Body={4}" -f $ExpectStatus, $status, $Method, $uri, $text)
    }
  } else {
    if ($status -lt 200 -or $status -ge 300) {
      throw ("HTTP {0} for {1} {2}. Body={3}" -f $status, $Method, $uri, $text)
    }
  }

  return [pscustomobject]@{
    Ok      = $true
    Status  = $status
    Method  = $Method
    Uri     = $uri
    Text    = $text
    Body    = $parsed
    Headers = $outHeaders
  }
}

# Convenience wrappers (optional)
function OpsHealth { param([Parameter(Mandatory = $true)][string]$BaseUrl) OpsRequest -BaseUrl $BaseUrl -Method GET -Path "/ops/health" }

function OpsCreateVisitor {
  param(
    [Parameter(Mandatory = $true)][string]$BaseUrl,
    [Parameter(Mandatory = $true)][string]$Name,
    [string]$Email = $null
  )
  $b = @{ name = $Name }
  if ($Email -and $Email.Trim().Length -gt 0) { $b.email = $Email }
  OpsRequest -BaseUrl $BaseUrl -Method POST -Path "/ops/visitors" -Body $b
}

function OpsPopulateDummy { param([Parameter(Mandatory = $true)][string]$BaseUrl) OpsRequest -BaseUrl $BaseUrl -Method POST -Path "/ops/populate-dummy" }

function OpsAppendEvent {
  param(
    [Parameter(Mandatory = $true)][string]$BaseUrl,
    [Parameter(Mandatory = $true)][string]$VisitorId,
    [Parameter(Mandatory = $true)][string]$Type,
    [object]$Metadata = $null
  )
  $b = @{ type = $Type }
  if ($null -ne $Metadata) { $b.metadata = $Metadata }
  OpsRequest -BaseUrl $BaseUrl -Method POST -Path ("/ops/visitors/{0}/events" -f $VisitorId) -Body $b
}

function OpsDashboard {
  param(
    [Parameter(Mandatory = $true)][string]$BaseUrl,
    [Parameter(Mandatory = $true)][string]$VisitorId,
    [int]$Limit = 20
  )
  OpsRequest -BaseUrl $BaseUrl -Method GET -Path ("/ops/visitors/{0}/dashboard?limit={1}" -f $VisitorId, $Limit)
}

function OpsTimeline {
  param(
    [Parameter(Mandatory = $true)][string]$BaseUrl,
    [Parameter(Mandatory = $true)][string]$VisitorId,
    [int]$Limit = 50,
    [string]$Cursor = $null
  )
  $p = "/ops/visitors/{0}/timeline?limit={1}" -f $VisitorId, $Limit
  if ($Cursor -and $Cursor.Trim().Length -gt 0) { $p = $p + "&cursor=" + [uri]::EscapeDataString($Cursor) }
  OpsRequest -BaseUrl $BaseUrl -Method GET -Path $p
}
