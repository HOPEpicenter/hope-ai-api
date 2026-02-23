param(
  [Parameter(Mandatory=$false)]
  [string]$ApiBaseUrl = "http://127.0.0.1:3000/api",

  [Parameter(Mandatory=$false)]
  [string]$ApiKey = $env:HOPE_API_KEY,

  [Parameter(Mandatory=$false)]
  [int]$TotalEvents = 0,

  [Parameter(Mandatory=$false)]
  [int]$TotalEngagement = 0,

  [Parameter(Mandatory=$false)]
  [int]$TotalFormation = 0,

  [Parameter(Mandatory=$false)]
  [int]$Limit = 10,

  [Parameter(Mandatory=$false)]
  [int]$TieEvery = 5,

  [Parameter(Mandatory=$false)]
  [int]$MaxWaitSeconds = 60,

  [Parameter(Mandatory=$false)]
  [int]$PollIntervalMs = 750
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

# Normalize totals: -TotalEvents splits evenly unless explicit per-stream totals are provided
if ($TotalEngagement -eq 0 -and $TotalFormation -eq 0) {
  if ($TotalEvents -le 0) { $TotalEvents = 800 } # sensible default
  $TotalEngagement = [int][Math]::Ceiling($TotalEvents / 2)
  $TotalFormation  = [int]($TotalEvents - $TotalEngagement)
}
elseif ($TotalEvents -gt 0) {
  Write-Warning "Ignoring -TotalEvents because -TotalEngagement/-TotalFormation were provided."
}

function Assert-True([bool]$cond, [string]$msg) {
  if (-not $cond) { throw "ASSERT FAIL: $msg" }
}

function Normalize-ApiBaseUrl([string]$u) {
  if ([string]::IsNullOrWhiteSpace($u)) { throw "ApiBaseUrl is required" }
  $u = $u.TrimEnd("/")
  if ($u -notmatch "/api$") { $u = "$u/api" }
  return $u
}

function New-EvtId() {
  return "evt-$([Guid]::NewGuid().ToString('N'))"
}

function Invoke-PostJson {
  param(
    [Parameter(Mandatory=$true)][string]$Uri,
    [Parameter(Mandatory=$true)][hashtable]$Headers,
    [Parameter(Mandatory=$true)][object]$Body
  )

  $json = $Body | ConvertTo-Json -Depth 30

  try {
    $resp = Invoke-WebRequest -UseBasicParsing -Method POST -Uri $Uri -Headers $Headers -ContentType "application/json" -Body $json
    return [pscustomobject]@{
      StatusCode = [int]$resp.StatusCode
      Content    = [string]$resp.Content
    }
  } catch {
    # capture status + body when server returns an error payload
    $ex = $_.Exception
    $status = $null
    $text = $null

    try {
      if ($ex.Response) {
        try { $status = [int]$ex.Response.StatusCode } catch { }
        try {
          $stream = $ex.Response.GetResponseStream()
          if ($stream) {
            $reader = New-Object System.IO.StreamReader($stream)
            $text = $reader.ReadToEnd()
            $reader.Close()
          }
        } catch { }
      }
    } catch { }

    if ([string]::IsNullOrWhiteSpace($text)) {
      try { $text = ($_ | Out-String) } catch { }
    }

    return [pscustomobject]@{
      StatusCode = $status
      Content    = [string]$text
    }
  }
}

function Invoke-GetJson {
  param(
    [Parameter(Mandatory=$true)][string]$Uri,
    [Parameter(Mandatory=$true)][hashtable]$Headers
  )
  return Invoke-RestMethod -Method GET -Uri $Uri -Headers $Headers
}

# -------------------- Setup --------------------

$api = Normalize-ApiBaseUrl $ApiBaseUrl

Assert-True (-not [string]::IsNullOrWhiteSpace($ApiKey)) "HOPE_API_KEY is not set (or pass -ApiKey)."
$headers = @{ "x-api-key" = $ApiKey }

Write-Host "=== STRESS: Integration timeline paging (with occurredAt ties) ==="
Write-Host "ApiBaseUrl      : $api"
Write-Host "TotalEngagement : $TotalEngagement"
Write-Host "TotalFormation  : $TotalFormation"
Write-Host "Limit           : $Limit"
Write-Host "TieEvery        : $TieEvery"
Write-Host "MaxWaitSeconds  : $MaxWaitSeconds"
Write-Host ""

# health
$h = Invoke-WebRequest -UseBasicParsing -Method GET -Uri "$api/health"
Assert-True ($h.StatusCode -eq 200) "Expected 200 from GET $api/health"

# create visitor (public)
$email = ("stress-ties+" + [Guid]::NewGuid().ToString("N") + "@example.com")
$visitor = Invoke-RestMethod -Method POST -Uri "$api/visitors" -ContentType "application/json" -Body (@{
  name   = "Stress Ties Paging"
  email  = $email
  source = "dev"
} | ConvertTo-Json -Depth 10)

$vid = [string]$visitor.visitorId
Assert-True (-not [string]::IsNullOrWhiteSpace($vid)) "POST /visitors did not return visitorId"
Write-Host "visitorId=$vid"
Write-Host ""

# -------------------- Build events (with cross-stream ties) --------------------
# Strategy:
# - We create blocks of TieEvery events.
# - For each block, we force the first TWO events to share the exact same occurredAt:
#     1) engagement  (if any left)
#     2) formation   (if any left)
# - Remaining events in block get unique occurredAt values (still monotonic).
# - We interleave posting, so ties are realistic across streams.

Assert-True ($TieEvery -ge 2) "TieEvery must be >= 2 to create meaningful ties."

$expected = $TotalEngagement + $TotalFormation

# IntegrationService only reads a bounded window per stream:
# perStream = min(200, max(50, safeLimit*5))
$safeLimit = [Math]::Max(1, [Math]::Min(200, $Limit))
$perStream = [Math]::Min(200, [Math]::Max(50, $safeLimit * 5))

# Total items the integration endpoint can possibly page through in a single run
$expectedUnique = $TotalEngagement + $TotalFormation
$events = New-Object System.Collections.Generic.List[object]

$base = (Get-Date).ToUniversalTime().AddMinutes(-30)
$tickMs = 0

$remainEng = $TotalEngagement
$remainForm = $TotalFormation

while (($remainEng + $remainForm) -gt 0) {
  # make a base timestamp for this block
  $tieTs = $base.AddMilliseconds($tickMs).ToString("o")
  $tickMs += 1

  # [A] forced tie pair: engagement then formation (when available)
  if ($remainEng -gt 0) {
    $events.Add(@{
      kind = "engagement"
      body = @{
        v          = 1
        eventId    = (New-EvtId)
        visitorId  = $vid
        type       = "note.add"
        occurredAt = $tieTs
        source     = @{ system = "scripts/stress-integration-timeline-paging.ps1" }
        data       = @{ text = "tie engagement" }
      }
    })
    $remainEng -= 1
  }

  if ($remainForm -gt 0) {
    $events.Add(@{
      kind = "formation"
      body = @{
        v          = 1
        eventId    = (New-EvtId)
        visitorId  = $vid
        type       = "FOLLOWUP_ASSIGNED"
        occurredAt = $tieTs
        source     = @{ system = "scripts/stress-integration-timeline-paging.ps1" }
        data       = @{
          assigneeId = "stress-ties"
          channel    = "api"
          notes      = "tie formation"
        }
      }
    })
    $remainForm -= 1
  }

  # [B] fill the rest of the block with unique timestamps
  for ($i = 2; $i -lt $TieEvery; $i++) {
    if (($remainEng + $remainForm) -le 0) { break }

    $ts = $base.AddMilliseconds($tickMs).ToString("o")
    $tickMs += 1

    # alternate if both remain, otherwise use what remains
    $pickEng = $false
    if ($remainEng -gt 0 -and $remainForm -gt 0) {
      $pickEng = (($tickMs % 2) -eq 0)
    } elseif ($remainEng -gt 0) {
      $pickEng = $true
    }

    if ($pickEng -and $remainEng -gt 0) {
      $events.Add(@{
        kind = "engagement"
        body = @{
          v          = 1
          eventId    = (New-EvtId)
          visitorId  = $vid
          type       = "note.add"
          occurredAt = $ts
          source     = @{ system = "scripts/stress-integration-timeline-paging.ps1" }
          data       = @{ text = "engagement $($TotalEngagement - $remainEng + 1)" }
        }
      })
      $remainEng -= 1
    } elseif ($remainForm -gt 0) {
      $events.Add(@{
        kind = "formation"
        body = @{
          v          = 1
          eventId    = (New-EvtId)
          visitorId  = $vid
          type       = "FOLLOWUP_ASSIGNED"
          occurredAt = $ts
          source     = @{ system = "scripts/stress-integration-timeline-paging.ps1" }
          data       = @{
            assigneeId = "stress-ties"
            channel    = "api"
            notes      = "formation $($TotalFormation - $remainForm + 1)"
          }
        }
      })
      $remainForm -= 1
    }
  }
}

Assert-True ($events.Count -eq $expected) "Internal error: built $($events.Count) events, expected $expected"

# -------------------- Post events --------------------

Write-Host ("Posting {0} total events..." -f $events.Count)

$postedEng = 0
$postedForm = 0

for ($i = 0; $i -lt $events.Count; $i++) {
  $e = $events[$i]
  $kind = [string]$e.kind
  $body = $e.body

  $uri = if ($kind -eq "engagement") { "$api/engagements/events" } else { "$api/formation/events" }

  $r = Invoke-PostJson -Uri $uri -Headers $headers -Body $body
  if ($null -eq $r.StatusCode -or $r.StatusCode -lt 200 -or $r.StatusCode -ge 300) {
    throw ("POST {0} failed at i={1}. Status={2} Body={3}" -f $uri, $i, $r.StatusCode, $r.Content)
  }

  if ($kind -eq "engagement") { $postedEng++ } else { $postedForm++ }

  if ((($i + 1) % 50) -eq 0) {
    Write-Host ("  posted {0}/{1} (eng={2}, form={3})" -f ($i + 1), $events.Count, $postedEng, $postedForm)
  }
}

Write-Host ("Posted OK. eng={0} form={1}" -f $postedEng, $postedForm)
Write-Host ""

# -------------------- Wait for ingestion (because 202 Accepted may be async) --------------------

Write-Host ("Waiting for integration timeline window to be available (target uniqueIds={0})..." -f $expectedUnique)

$deadline = (Get-Date).AddSeconds($MaxWaitSeconds)
$seen = 0
while ((Get-Date) -lt $deadline) {
  try {
    $probe = Invoke-GetJson -Uri "$api/integration/timeline?visitorId=$vid&limit=1" -Headers $headers
    if ($probe.ok -eq $true) {
      # We can’t read total count directly from API; so we do a quick paging-less estimate by requesting a larger page.
      $probe2 = Invoke-GetJson -Uri "$api/integration/timeline?visitorId=$vid&limit=$Limit" -Headers $headers
      if ($probe2.ok -eq $true) {
        $seen = @($probe2.items).Count
        if ($seen -ge [Math]::Min($expected, $Limit)) {
          # good enough signal that data exists; proceed to full paging (which will verify full count)
          break
        }
      }
    }
  } catch { }

  Start-Sleep -Milliseconds $PollIntervalMs
}

Write-Host ("Proceeding to paging run (preview seen on first page: {0})" -f $seen)
Write-Host ""

# -------------------- Page through timeline and assert no overlap --------------------

$all = New-Object System.Collections.Generic.HashSet[string]
$cursor = ""
$page = 0

while ($true) {
  $page++
  $url = "$api/integration/timeline?visitorId=$vid&limit=$Limit"
  if (-not [string]::IsNullOrWhiteSpace($cursor)) {
    $url = "$url&cursor=$([uri]::EscapeDataString($cursor))"
  }

  $resp = Invoke-GetJson -Uri $url -Headers $headers
  Assert-True ($resp.ok -eq $true) ("Page {0} expected ok=true" -f $page)

  $items = @($resp.items)
  if ($items.Count -eq 0) {
    # If we get empty page with a cursor, that’s suspicious but not necessarily fatal;
    # we’ll allow it only if nextCursor is null.
    $cursor = [string]$resp.nextCursor
    if ([string]::IsNullOrWhiteSpace($cursor)) { break }
    throw ("Empty page {0} returned non-null cursor (cursor={1})" -f $page, $cursor)
  }

  foreach ($it in $items) {
    $stream = [string]$it.stream
    $id = "{0}:{1}" -f $stream, [string]$it.eventId
    if ([string]::IsNullOrWhiteSpace($id)) {
      throw ("Missing eventId on page {0}. Item={1}" -f $page, ($it | ConvertTo-Json -Depth 10))
    }

    if (-not $all.Add($id)) {
      throw ("OVERLAP detected: eventId '{0}' repeated on page {1}" -f $id, $page)
    }
  }

  $cursor = [string]$resp.nextCursor
  if ([string]::IsNullOrWhiteSpace($cursor)) { break }

  if (($page % 10) -eq 0) {
    Write-Host ("  paged {0} pages, uniqueIds={1}" -f $page, $all.Count)
  }
}

Write-Host ""
Write-Host ("DONE paging. pages={0} uniqueIds={1}" -f $page, $all.Count)

# Strong assertion: we should see at least expected unique IDs.
# (If ingestion is still catching up, this is where it will fail—then increase MaxWaitSeconds.)
Assert-True ($all.Count -ge $expectedUnique) ("Expected >= {0} unique items (bounded integration window), got {1}. If low, increase -MaxWaitSeconds." -f $expectedUnique, $all.Count)

Write-Host "OK: stress integration timeline paging passed (no overlap, ties exercised)."


