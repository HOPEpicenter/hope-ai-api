# scripts/assert-engagement-pagination.ps1
# CI assertion: Engagements pagination is correct (newest-first, cursor exclusive, no overlaps)
# - Create a visitor
# - Create N engagements via POST /api/engagements (flat)
# - Page via GET /api/visitors/{id}/engagements?limit=&cursor=
# - Assert ordering + cursor semantics
# Default base url matches CI: http://127.0.0.1:3000

[CmdletBinding()]
param(
  [string]$BaseUrl = "http://127.0.0.1:3000",
  [int]$PageSize = 5,
  [int]$CreateCount = 12
)

$ErrorActionPreference = "Stop"

function Write-Log([string]$msg) { Write-Host "[assert-engagement-pagination] $msg" }

function Get-ApiHeaders {
  $h = @{ "Accept" = "application/json" }
  if ($env:HOPE_API_KEY) { $h["x-api-key"] = $env:HOPE_API_KEY }
  return $h
}

function Invoke-Json {
  param(
    [Parameter(Mandatory=$true)][ValidateSet("GET","POST","PUT","PATCH","DELETE")][string]$Method,
    [Parameter(Mandatory=$true)][string]$Uri,
    [Parameter()][object]$Body
  )

  $headers = Get-ApiHeaders

  if ($null -ne $Body) {
    $json = $Body | ConvertTo-Json -Depth 50 -Compress
    try {
      return Invoke-RestMethod -Method $Method -Uri $Uri -Headers $headers -ContentType "application/json" -Body $json
    } catch {
      $status = $null
      $respBody = $null
      try {
        if ($_.Exception.Response) {
          $status = [int]$_.Exception.Response.StatusCode
          $stream = $_.Exception.Response.GetResponseStream()
          if ($stream) {
            $reader = New-Object System.IO.StreamReader($stream)
            $respBody = $reader.ReadToEnd()
          }
        }
      } catch { }
      if ($status) { Write-Log "HTTP $status for $Method $Uri" }
      if ($respBody) { Write-Log "Response body: $respBody" }
      throw
    }
  } else {
    return Invoke-RestMethod -Method $Method -Uri $Uri -Headers $headers
  }
}

function New-RandId([int]$len = 8) {
  $chars = "abcdefghijklmnopqrstuvwxyz0123456789"
  -join (1..$len | ForEach-Object { $chars[(Get-Random -Minimum 0 -Maximum $chars.Length)] })
}

function Get-VisitorIdFromCreateResponse($resp) {
  if ($resp.id) { return [string]$resp.id }
  if ($resp.visitorId) { return [string]$resp.visitorId }
  if ($resp.visitor -and $resp.visitor.id) { return [string]$resp.visitor.id }
  throw "Could not determine visitorId from create visitor response."
}

function Get-ItemsAndCursor($resp) {
  $items = $null
  $cursor = $null

  if ($resp -is [System.Array]) {
    $items = $resp
  } elseif ($resp.items) {
    $items = $resp.items
    if ($resp.cursor) { $cursor = [string]$resp.cursor }
    elseif ($resp.nextCursor) { $cursor = [string]$resp.nextCursor }
  } elseif ($resp.engagements) {
    $items = $resp.engagements
    if ($resp.cursor) { $cursor = [string]$resp.cursor }
    elseif ($resp.nextCursor) { $cursor = [string]$resp.nextCursor }
  } elseif ($resp.data -and $resp.data.items) {
    $items = $resp.data.items
    if ($resp.data.cursor) { $cursor = [string]$resp.data.cursor }
    elseif ($resp.data.nextCursor) { $cursor = [string]$resp.data.nextCursor }
  } else {
    throw "Unrecognized list response shape. Expected items/engagements/array."
  }

  if ($null -eq $items) { $items = @() }
  return @{ items = @($items); cursor = $cursor }
}
function Normalize-IsoZ($v) {
  if ($null -eq $v) { return $null }

  # DateTime object (common after JSON conversion)
  if ($v -is [DateTime]) {
    return $v.ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ss.fffZ")
  }

  $s = ([string]$v).Trim()
  if (-not $s) { return $s }

  $dt = New-Object DateTime

  # Prefer ISO-ish formats first (so we don't misinterpret dates like 01/02/2026)
  $isoFormats = @(
    "yyyy-MM-ddTHH:mm:ss.fffZ",
    "yyyy-MM-ddTHH:mm:ssZ",
    "yyyy-MM-ddTHH:mm:ss.fffK",
    "yyyy-MM-ddTHH:mm:ssK"
  )

  if ([DateTime]::TryParseExact(
      $s,
      $isoFormats,
      [Globalization.CultureInfo]::InvariantCulture,
      [Globalization.DateTimeStyles]::AssumeUniversal -bor [Globalization.DateTimeStyles]::AdjustToUniversal,
      [ref]$dt
    )) {
    return $dt.ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ss.fffZ")
  }

  # Fallback: simplest TryParse overload (exists broadly)
  $dt2 = New-Object DateTime
  if ([DateTime]::TryParse($s, [ref]$dt2)) {
    return $dt2.ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ss.fffZ")
  }

  # If parse fails, return original string
  return $s
}

function Get-OrderKey($item) {
  if (-not $item.occurredAt) { throw "Missing occurredAt on item; cannot compute order key." }
  if (-not $item.id) { throw "Missing id on item; cannot compute order key." }

  $iso = Normalize-IsoZ $item.occurredAt
  return "$iso`_$([string]$item.id)"
}

function Assert-NewestFirst([object[]]$items) {
  for ($i=1; $i -lt $items.Count; $i++) {
    $prev = Get-OrderKey $items[$i-1]
    $curr = Get-OrderKey $items[$i]
    if ([string]::CompareOrdinal($prev, $curr) -lt 0) {
      throw "Order violation (not newest-first): prev key=$prev  curr key=$curr"
    }
  }
}

function Assert-NoOverlap([object[]]$a, [object[]]$b) {
  $set = New-Object 'System.Collections.Generic.HashSet[string]'
  foreach ($it in $a) { [void]$set.Add((Get-OrderKey $it)) }
  foreach ($it in $b) {
    $k = Get-OrderKey $it
    if ($set.Contains($k)) { throw "Overlap violation: item appears in both pages: key=$k" }
  }
}

function Assert-CursorExclusiveUpperBound([string]$cursor, [object[]]$page2) {
  if (-not $cursor) { throw "Expected non-empty cursor for page1, got empty." }
  foreach ($it in $page2) {
    $k = Get-OrderKey $it
    if ([string]::CompareOrdinal($k, $cursor) -ge 0) {
      throw "Cursor bound violation: page2 item key must be < cursor. key=$k cursor=$cursor"
    }
  }
}

function Create-Engagement {
  param([string]$base,[string]$visitorId)

  $ts = (Get-Date).ToString("yyyy-MM-ddTHH:mm:ss.fffZ")
  $note = "ci-pagination-assert $ts $(New-RandId 6)"

  $body = @{ visitorId = $visitorId; type = "NOTE"; note = $note }
  [void](Invoke-Json -Method POST -Uri "$base/api/engagements" -Body $body)
}

Write-Log "BaseUrl=$BaseUrl PageSize=$PageSize CreateCount=$CreateCount"
$base = $BaseUrl.TrimEnd("/")

$rand = New-RandId 6
$email = "ci.engagements+$((Get-Date).ToString('yyyyMMddHHmmss'))_$rand@example.com"
$createVisitorBody = @{ firstName="CI"; lastName="Paging"; email=$email; phone="555-0100"; notes="ci pagination assert" }

Write-Log "Creating visitor..."
$visitorResp = Invoke-Json -Method POST -Uri "$base/api/visitors" -Body $createVisitorBody
$visitorId = Get-VisitorIdFromCreateResponse $visitorResp
Write-Log "visitorId=$visitorId"

Write-Log "Creating $CreateCount engagements via POST /api/engagements..."
1..$CreateCount | ForEach-Object { Create-Engagement -base $base -visitorId $visitorId; Start-Sleep -Milliseconds 25 }

Write-Log "Listing page1..."
$page1Resp = Invoke-Json -Method GET -Uri "$base/api/visitors/$visitorId/engagements?limit=$PageSize"
$p1 = Get-ItemsAndCursor $page1Resp
$page1 = $p1.items
$cursor = $p1.cursor
Write-Log "page1 count=$($page1.Count) cursor=$cursor"
if ($page1.Count -lt 2) { throw "Expected at least 2 items on page1; got $($page1.Count)." }
Assert-NewestFirst $page1
if (-not $cursor) { throw "Expected cursor on page1, got empty." }

Write-Log "Listing page2..."
$page2Resp = Invoke-Json -Method GET -Uri "$base/api/visitors/$visitorId/engagements?limit=$PageSize&cursor=$([uri]::EscapeDataString($cursor))"
$p2 = Get-ItemsAndCursor $page2Resp
$page2 = $p2.items
Write-Log "page2 count=$($page2.Count)"
if ($page2.Count -eq 0) { throw "Expected at least 1 item on page2; got 0." }
Assert-NewestFirst $page2
Assert-NoOverlap $page1 $page2
Assert-CursorExclusiveUpperBound $cursor $page2

Write-Log "OK: engagement pagination assertions passed."