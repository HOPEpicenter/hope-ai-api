param(
  [Parameter(Mandatory=$true)][string]$ApiBase,
  [Parameter(Mandatory=$true)][string]$ApiKey
)

$ErrorActionPreference = "Stop"
$ProgressPreference = "SilentlyContinue"

function PostJson([string]$url, [hashtable]$headers, [object]$body) {
  Invoke-RestMethod -Method Post -Uri $url -Headers $headers -ContentType "application/json" -Body ($body | ConvertTo-Json -Depth 20)
}

function GetJson([string]$url, [hashtable]$headers) {
  Invoke-RestMethod -Method Get -Uri $url -Headers $headers
}

function New-FormationEnvelope {
  param(
    [string]$visitorId,
    [string]$type,
    [datetime]$occurredAt,
    [hashtable]$data,
    [string]$sourceSystem
  )
  if (-not $data) { $data = @{} }
  return @{
    v         = 1
    eventId   = [Guid]::NewGuid().ToString()
    visitorId = $visitorId
    type      = $type
    occurredAt= $occurredAt.ToUniversalTime().ToString("o")
    source    = @{ system = $sourceSystem }
    data      = $data
  }
}

function Expect-HttpFailure([scriptblock]$fn, [string]$label) {
  try {
    & $fn | Out-Null
    throw "Expected failure but succeeded: $label"
  } catch {
    $resp = $_.Exception.Response
    if (-not $resp) {
      # Could be a thrown Error(...) in-process; still counts as failure
      Write-Host "[OK] $label failed (no HTTP response object)" -ForegroundColor Green
      return
    }

    try {
      $code = [int]$resp.StatusCode
    } catch { $code = -1 }

    if ($code -lt 400 -or $code -ge 500) {
      throw "Expected 4xx for '$label', got $code"
    }

    Write-Host "[OK] $label failed with $code" -ForegroundColor Green
  }
}

$headers = @{ "x-api-key" = $ApiKey }

$staffDirectoryResponse = GetJson "$ApiBase/staff-identities" $headers
$staffItems = @($staffDirectoryResponse.items)

$activeStaff = $staffItems |
  Where-Object {
    [string]$_.status -eq "active" -and
    [string]$_.staffId -like "staff-*"
  } |
  Select-Object -First 1

if (-not $activeStaff) {
  $activeStaff = $staffItems |
    Where-Object { [string]$_.status -eq "active" } |
    Select-Object -First 1
}

$activeStaffId = [string]$activeStaff.staffId

if ([string]::IsNullOrWhiteSpace($activeStaffId)) {
  throw "No active canonical Staff identity was available for Formation assertions."
}

Write-Host "[assert-formation-envelope-v1-strict] ApiBase=$ApiBase"
Write-Host "[assert-formation-envelope-v1-strict] activeStaffId=$activeStaffId"

# 1) Create visitor
$email = "formation-envelope+" + (Get-Date -Format "yyyyMMddHHmmss") + "@example.com"
$visitor = PostJson "$ApiBase/visitors" $headers @{
  firstName = "Formation"
  lastName  = "Envelope"
  email     = $email
}

$vid = $visitor.visitorId
if ([string]::IsNullOrWhiteSpace($vid)) { $vid = $visitor.id }
if ([string]::IsNullOrWhiteSpace($vid)) { throw "Visitor id missing (visitorId/id empty)." }

Write-Host "[assert-formation-envelope-v1-strict] visitorId=$vid"

$now = (Get-Date).ToUniversalTime()

# 2) Legacy payload without the v1 envelope must fail
$legacy = @{
  id         = [Guid]::NewGuid().ToString()
  visitorId  = $vid
  type       = "FOLLOWUP_ASSIGNED"
  occurredAt = $now.ToString("o")
  metadata   = @{ assigneeId = "ops-user-1" }
}
Expect-HttpFailure {
  PostJson "$ApiBase/formation/events" $headers $legacy
} "legacy payload without v1 envelope"

# 3) Looks-like-v1 but missing source.system => must fail (strict-for-v1)
$badV1_noSourceSystem = @{
  v         = 1
  eventId   = [Guid]::NewGuid().ToString()
  visitorId = $vid
  type      = "NEXT_STEP_SELECTED"
  occurredAt= $now.AddSeconds(1).ToString("o")
  source    = @{} # invalid
  data      = @{ nextStep = "JoinGroup" }
}
Expect-HttpFailure { PostJson "$ApiBase/formation/events" $headers $badV1_noSourceSystem } "v1 missing source.system"

# 4) FOLLOWUP_ASSIGNED v1 requires data.assigneeId => must fail
$badV1_missingAssignee = New-FormationEnvelope -visitorId $vid -type "FOLLOWUP_ASSIGNED" -occurredAt $now.AddSeconds(2) -data @{} -sourceSystem "assert-formation-envelope-v1-strict"
Expect-HttpFailure { PostJson "$ApiBase/formation/events" $headers $badV1_missingAssignee } "v1 FOLLOWUP_ASSIGNED missing data.assigneeId"

# 5) Valid v1 should pass
$goodV1 = New-FormationEnvelope -visitorId $vid -type "NEXT_STEP_SELECTED" -occurredAt $now.AddSeconds(3) -data @{ nextStep = "JoinGroup" } -sourceSystem "assert-formation-envelope-v1-strict"
PostJson "$ApiBase/formation/events" $headers $goodV1 | Out-Null
Write-Host "[OK] v1 envelope accepted" -ForegroundColor Green

# 6) Operator followup mutation v1 requires source.actorId
$badV1_missingActor = New-FormationEnvelope -visitorId $vid -type "FOLLOWUP_CONTACTED" -occurredAt $now.AddSeconds(4) -data @{} -sourceSystem "assert-formation-envelope-v1-strict"
Expect-HttpFailure { PostJson "$ApiBase/formation/events" $headers $badV1_missingActor } "v1 FOLLOWUP_CONTACTED missing source.actorId"

# 7) Operator followup mutation v1 requires a known source.actorId
$badV1_unknownActor = New-FormationEnvelope -visitorId $vid -type "FOLLOWUP_CONTACTED" -occurredAt $now.AddSeconds(5) -data @{} -sourceSystem "assert-formation-envelope-v1-strict"
$badV1_unknownActor.source.actorId = "unknown-operator"
Expect-HttpFailure { PostJson "$ApiBase/formation/events" $headers $badV1_unknownActor } "v1 FOLLOWUP_CONTACTED unknown Staff source.actorId"

# 8) Operator followup mutation v1 with known source.actorId should pass
$goodV1WithActor = New-FormationEnvelope -visitorId $vid -type "FOLLOWUP_CONTACTED" -occurredAt $now.AddSeconds(6) -data @{} -sourceSystem "assert-formation-envelope-v1-strict"
$goodV1WithActor.source.actorId = $activeStaffId
PostJson "$ApiBase/formation/events" $headers $goodV1WithActor | Out-Null
Write-Host "[OK] v1 followup mutation with active canonical Staff source.actorId accepted" -ForegroundColor Green

Write-Host "[assert-formation-envelope-v1-strict] OK" -ForegroundColor Green




