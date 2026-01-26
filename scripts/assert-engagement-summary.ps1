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
  $u = $root
  if ($null -eq $u) { $u = "" }
  $u = $u.Trim()
  if (-not $u) { $u = "http://127.0.0.1:3000" }
  $u = $u.TrimEnd("/")

  $lower = $u.ToLower()
  if ($lower.EndsWith("/api")) { return $u }

  $idx = $lower.IndexOf("/api/")
  if ($idx -ge 0) { $u = $u.Substring(0, $idx) }

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

# Fail fast if server isn't reachable
try {
  Invoke-RestMethod -Method Get -Uri ("{0}/health" -f $api) -Headers $headers -TimeoutSec 5 | Out-Null
} catch {
  throw ("Server not reachable at {0}. Start Express (or run scripts/ci-run-express-smoke.ps1). Original: {1}" -f $api, $_.Exception.Message)
}

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
Must ($visitorId -and ($visitorId.ToString().Length -ge 10)) ("Visitor create did not return id. Payload={0}" -f (To-Json $visitor))
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
$resp = Invoke-RestMethod -Method Get -Uri ("{0}/visitors/{1}/engagements/summary" -f $api, $visitorId) -Headers $headers

Must ($resp.ok -eq $true) ("resp.ok was not true. Payload={0}" -f (To-Json $resp))
Must ($resp.summary) ("resp.summary missing. Payload={0}" -f (To-Json $resp))

$s = $resp.summary

Must ($s.eventCount -eq $CreateCount) ("Expected eventCount={0} but got [{1}]. Payload={2}" -f $CreateCount, $s.eventCount, (To-Json $resp))
Must ($s.firstEngagedAt -eq $expectedFirst) ("Expected firstEngagedAt={0} but got {1}. Payload={2}" -f $expectedFirst, $s.firstEngagedAt, (To-Json $resp))
Must ($s.lastEngagedAt -eq $expectedLast) ("Expected lastEngagedAt={0} but got {1}. Payload={2}" -f $expectedLast, $s.lastEngagedAt, (To-Json $resp))

# Validate per-type/per-channel counts (API uses 'types' and 'channels')
if ($s.types) {
  foreach ($k in $expectedByType.Keys) {
    Must ($s.types.$k -eq $expectedByType[$k]) ("types.{0} expected {1} got {2}. Payload={3}" -f $k, $expectedByType[$k], $s.types.$k, (To-Json $resp))
  }
}

if ($s.channels) {
  foreach ($k in $expectedByChannel.Keys) {
    Must ($s.channels.$k -eq $expectedByChannel[$k]) ("channels.{0} expected {1} got {2}. Payload={3}" -f $k, $expectedByChannel[$k], $s.channels.$k, (To-Json $resp))
  }
}

Write-Log "OK: engagement summary assertions passed."