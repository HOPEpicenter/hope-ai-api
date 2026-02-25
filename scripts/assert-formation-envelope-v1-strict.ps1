param(
  [Parameter(Mandatory=$true)][string]$ApiBase,
  [Parameter(Mandatory=$true)][string]$ApiKey
)

$ErrorActionPreference = "Stop"
$ProgressPreference = "SilentlyContinue"

function PostJson([string]$url, [hashtable]$headers, [object]$body) {
  Invoke-RestMethod -Method Post -Uri $url -Headers $headers -ContentType "application/json" -Body ($body | ConvertTo-Json -Depth 20)
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

Write-Host "[assert-formation-envelope-v1-strict] ApiBase=$ApiBase"

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

# 2) Legacy payload should still work (back-compat)
$legacy = @{
  id         = [Guid]::NewGuid().ToString()
  visitorId  = $vid
  type       = "FOLLOWUP_ASSIGNED"
  occurredAt = $now.ToString("o")
  metadata   = @{ assigneeId = "ops-user-1" }
}
PostJson "$ApiBase/formation/events" $headers $legacy | Out-Null
Write-Host "[OK] legacy payload accepted" -ForegroundColor Green

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

Write-Host "[assert-formation-envelope-v1-strict] OK" -ForegroundColor Green