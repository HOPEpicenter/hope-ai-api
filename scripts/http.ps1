# scripts/http.ps1
# Shared HTTP helpers for smoke/ops scripts (PowerShell 7).
Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

function HopeUrl {
  param(
    [Parameter(Mandatory=$true)][string]$BaseUrl,
    [Parameter(Mandatory=$true)][string]$Path
  )
  $b = $BaseUrl.TrimEnd("/")
  $p = $Path
  if (-not $p.StartsWith("/")) { $p = "/" + $p }
  return $b + $p
}

function Get-HopeApiKey {
  $k = $env:HOPE_API_KEY
  if (-not $k) { return $null }
  $t = ([string]$k).Trim()
  if ([string]::IsNullOrWhiteSpace($t)) { return $null }

  $lower = $t.ToLowerInvariant()
  $looksPlaceholder =
    ($t.StartsWith("<") -and $t.EndsWith(">")) -or
    ($lower.Contains("placeholder")) -or
    ($lower.Contains("changeme")) -or
    ($lower.Contains("dev key")) -or
    ($lower.Contains("your dev")) -or
    ($lower.Contains("your key"))

  if ($looksPlaceholder) { return $null }
  return $t
}

function Invoke-HopeRequest {
  [CmdletBinding()]
  param(
    [Parameter(Mandatory=$true)][string]$BaseUrl,
    [Parameter(Mandatory=$true)][ValidateSet("GET","POST","PUT","PATCH","DELETE")][string]$Method,
    [Parameter(Mandatory=$true)][string]$Path,
    [object]$Body = $null,
    [hashtable]$Headers = $null,
    [int]$ExpectStatus = 0,
    [int]$TimeoutSec = 30,
    [switch]$RequireApiKey
  )

  $uri = HopeUrl -BaseUrl $BaseUrl -Path $Path

  $reqHeaders = @{}
  if ($Headers) { foreach ($k in $Headers.Keys) { $reqHeaders[$k] = $Headers[$k] } }
  if (-not $reqHeaders.ContainsKey("accept")) { $reqHeaders["accept"] = "application/json" }

  # Central x-api-key injection
  $k = Get-HopeApiKey
  if ($RequireApiKey -and -not $k) {
    return [pscustomobject]@{
      Ok = $false; Status = 0; Method = $Method; Uri = $uri
      Text = "Missing HOPE_API_KEY"; Body = $null; Headers = @{}
      Skip = $true
    }
  }
  if ($k -and -not $reqHeaders.ContainsKey("x-api-key")) {
    $reqHeaders["x-api-key"] = $k
  }

  $json = $null
  if ($null -ne $Body) {
    $json = ($Body | ConvertTo-Json -Depth 20 -Compress)
    if (-not $reqHeaders.ContainsKey("content-type")) { $reqHeaders["content-type"] = "application/json" }
  }

  $status = 0
  $text = ""
  $outHeaders = @{}

  try {
    $resp = $null
    if ($null -ne $json) {
      $resp = Invoke-WebRequest -Uri $uri -Method $Method -Headers $reqHeaders -Body $json -TimeoutSec $TimeoutSec -ErrorAction Stop
    } else {
      $resp = Invoke-WebRequest -Uri $uri -Method $Method -Headers $reqHeaders -TimeoutSec $TimeoutSec -ErrorAction Stop
    }

    $status = [int]$resp.StatusCode
    $text = [string]$resp.Content
    try { $outHeaders = $resp.Headers } catch { $outHeaders = @{} }
  }
  catch {
    # Extract HTTP response where possible (PowerShell exception shapes vary)
    $ex = $_.Exception
    $r = $null
    if ($ex) {
      $p = $ex.PSObject.Properties.Match('Response')
      if (@($p).Count -gt 0) { $r = $ex.Response }
    }

    if ($r) {
      try { $status = [int]$r.StatusCode } catch { $status = 0 }
      try { $outHeaders = $r.Headers } catch { $outHeaders = @{} }
      try {
        $stream = $r.GetResponseStream()
        if ($stream) {
          $reader = New-Object System.IO.StreamReader($stream)
          $text = $reader.ReadToEnd()
          $reader.Close()
        }
      } catch {
        $text = if ($ex -and $ex.Message) { [string]$ex.Message } else { "Request failed" }
      }
    } else {
      $text = if ($ex -and $ex.Message) { [string]$ex.Message } else { "Request failed" }
    }
  }

  $parsed = $null
  if ($text -and $text.Trim().Length -gt 0) { try { $parsed = $text | ConvertFrom-Json } catch { $parsed = $null } }

  if ($ExpectStatus -ne 0) {
    if ($status -ne $ExpectStatus) { throw ("Expected HTTP {0} but got {1} for {2} {3}. Body={4}" -f $ExpectStatus, $status, $Method, $uri, $text) }
  } else {
    if ($status -lt 200 -or $status -ge 300) { throw ("HTTP {0} for {1} {2}. Body={3}" -f $status, $Method, $uri, $text) }
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

function ApiRequest {
  param(
    [Parameter(Mandatory=$true)][string]$BaseUrl,
    [Parameter(Mandatory=$true)][ValidateSet("GET","POST","PUT","PATCH","DELETE")][string]$Method,
    [Parameter(Mandatory=$true)][string]$Path,
    [object]$Body = $null,
    [int]$ExpectStatus = 0,
    [hashtable]$Headers = $null,
    [switch]$RequireApiKey
  )
  Invoke-HopeRequest -BaseUrl $BaseUrl -Method $Method -Path $Path -Body $Body -ExpectStatus $ExpectStatus -Headers $Headers -RequireApiKey:$RequireApiKey
}

function OpsRequest {
  param(
    [Parameter(Mandatory=$true)][string]$BaseUrl,
    [Parameter(Mandatory=$true)][ValidateSet("GET","POST","PUT","PATCH","DELETE")][string]$Method,
    [Parameter(Mandatory=$true)][string]$Path,
    [object]$Body = $null,
    [int]$ExpectStatus = 0,
    [hashtable]$Headers = $null,
    [switch]$RequireApiKey
  )
  Invoke-HopeRequest -BaseUrl $BaseUrl -Method $Method -Path $Path -Body $Body -ExpectStatus $ExpectStatus -Headers $Headers -RequireApiKey:$RequireApiKey
}

function Get-BodyProp {
  param([Parameter(Mandatory=$true)]$Resp, [Parameter(Mandatory=$true)][string]$Name)
  if (-not $Resp -or -not $Resp.Body) { return $null }
  $p = $Resp.Body.PSObject.Properties.Match($Name)
  if (@($p).Count -lt 1) { return $null }
  return $Resp.Body.$Name
}

function Assert-RequestId {
  param([Parameter(Mandatory=$true)]$Resp, [Parameter(Mandatory=$true)][string]$Context)
  $h = $Resp.Headers
  if (-not $h) { throw "Missing headers in response ($Context)" }
  $rid = $null
  try { $rid = $h["x-request-id"] } catch { }
  if (-not $rid) { try { $rid = $h["X-Request-Id"] } catch { } }
  if (-not $rid) { try { $rid = $h.'x-request-id' } catch { } }
  if (-not $rid) { try { $rid = $h.'X-Request-Id' } catch { } }
  if (-not $rid) { throw "Missing x-request-id header ($Context)" }
  return [string]$rid
}
