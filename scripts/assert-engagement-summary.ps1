[CmdletBinding()]
param(
  [Parameter(Mandatory=$false)][string]$BaseUrl = "http://127.0.0.1:3000",
  [Parameter(Mandatory=$false)][int]$CreateCount = 12
)

$ErrorActionPreference = "Stop"

function Write-Log([string]$msg) { Write-Host "[assert-engagement-summary] $msg" }

function To-Json($o) {
  try { return ($o | ConvertTo-Json -Depth 50) } catch { return "<non-serializable>" }
}
function Must([bool]$cond, [string]$msg) {
  if (-not $cond) { throw $msg }
}

function Normalize-ApiBase([string]$root) {
  $u = $root; if ($null -eq $u) { $u = "" }; $u = $u.Trim()
  if (-not $u) { $u = "http://127.0.0.1:3000" }
  if ($u.EndsWith("/")) { $u = $u.TrimEnd("/") }
  # If caller already passed /api (or /api/...), strip to root then re-add exactly once
  if ($u.ToLower().EndsWith("/api")) { return $u }
  if ($u.ToLower().Contains("/api/")) {
    $idx = $u.ToLower().IndexOf("/api/")
    $u = $u.Substring(0, $idx)
  }
  return ($u.TrimEnd("/") + "/api")
}

function Get-Headers() {
  $k = $env:HOPE_API_KEY
  if ($k) { return @{ "x-api-key" = $k } }
  return @{}
}

$api = Normalize-ApiBase $BaseUrl
Write-Log ("ApiBase={0} CreateCount={1}" -f $api, $CreateCount)

$headers = Get-Headers

# --- Create a visitor
Write-Log "Creating visitor..."
$stamp = (Get-Date).ToUniversalTime().ToString("yyyyMMddHHmmss")
$visitorBody = @{
  firstName = "CI"
  lastName  = "Summary"
  email     = ("ci-summary-{0}@example.com" -f $stamp)
  phone     = "555-0000"
  notes     = "assert-engagement-summary"
} | ConvertTo-Json -Depth 10

$visitor = Invoke-RestMethod -Method Post -Uri ("{0}/visitors" -f $api) -Headers $headers -ContentType "application/json" -Body $visitorBody
$visitorId = $visitor.id
Must ($visitorId -and ($visitorId.ToString().Length -ge 10)) "Visitor create did not return id"
Write-Log ("visitorId={0}" -f $visitorId)

# --- Create engagements with deterministic occurredAt + type/channel distribution
Write-Log ("Creating {0} engagements..." -f $CreateCount)

$types    = @("call","visit","email")
$channels = @("phone","in-person","web")

$start = (Get-Date).ToUniversalTime().AddMinutes(-1 * [Math]::Max(1,$CreateCount))
$created = @()

for ($i=0; $i -lt $CreateCount; $i++) {
  $t = $types[$i % $types.Count]
  $c = $channels[$i % $channels.Count]
  $occurredAt = $start.AddSeconds($i).ToString("o")

  $bodyObj = @{
    visitorId   = $visitorId
    type        = $t
    channel     = $c
    note        = ("summary-assert-{0}" -f $i)
    occurredAt  = $occurredAt
  }

  $created += $bodyObj

  Invoke-RestMethod -Method Post -Uri ("{0}/engagements" -f $api) -Headers $headers -ContentType "application/json" -Body ($bodyObj | ConvertTo-Json -Depth 10) | Out-Null
}

# --- Expected counts
$expectedByType = @{}
$expectedByChannel = @{}
foreach ($e in $created) {
  if (-not $expectedByType.ContainsKey($e.type)) { $expectedByType[$e.type] = 0 }
  if (-not $expectedByChannel.ContainsKey($e.channel)) { $expectedByChannel[$e.channel] = 0 }
  $expectedByType[$e.type]++
  $expectedByChannel[$e.channel]++
}

$expectedFirst = ($created | Select-Object -First 1).occurredAt
$expectedLast  = ($created | Select-Object -Last 1).occurredAt

# --- Fetch summary
Write-Log "Fetching summary..."
$summary = Invoke-RestMethod -Method Get -Uri ("{0}/visitors/{1}/engagements/summary" -f $api, $visitorId) -Headers $headers

Must ($summary.ok -eq $true) "summary.ok was not true"
Must ($summary.eventCount -eq $CreateCount) ("Expected eventCount={0} but got [{1}]. Payload={2}" -f $CreateCount, $summary.eventCount, (To-Json $summary))

Must ($summary.firstEngagedAt -eq $expectedFirst) ("Expected firstEngagedAt={0} but got {1}" -f $expectedFirst, $summary.firstEngagedAt)
Must ($summary.lastEngagedAt -eq $expectedLast) ("Expected lastEngagedAt={0} but got {1}" -f $expectedLast, $summary.lastEngagedAt)

# If API exposes per-type/per-channel, validate them
if ($summary.byType) {
  foreach ($k in $expectedByType.Keys) {
    Must ($summary.byType.$k -eq $expectedByType[$k]) ("byType.{0} expected {1} got {2}" -f $k, $expectedByType[$k], $summary.byType.$k)
  }
}

if ($summary.byChannel) {
  foreach ($k in $expectedByChannel.Keys) {
    Must ($summary.byChannel.$k -eq $expectedByChannel[$k]) ("byChannel.{0} expected {1} got {2}" -f $k, $expectedByChannel[$k], $summary.byChannel.$k)
  }
}

Write-Log "OK: engagement summary assertions passed."

