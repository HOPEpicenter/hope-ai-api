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

$headers = @{ "x-api-key" = $ApiKey }

Write-Host "[assert-formation-milestones-v1] ApiBase=$ApiBase"

# 1) Create visitor (match repo scripts)
$email = "formation-milestones+" + (Get-Date -Format "yyyyMMddHHmmss") + "@example.com"
$visitor = PostJson "$ApiBase/visitors" $headers @{
  firstName = "Formation"
  lastName  = "Milestones"
  email     = $email
}

$vid = $visitor.visitorId
if ([string]::IsNullOrWhiteSpace($vid)) { $vid = $visitor.id }
if ([string]::IsNullOrWhiteSpace($vid)) { throw "Visitor id missing (visitorId/id empty)." }

Write-Host "[assert-formation-milestones-v1] visitorId=$vid"

function To-UtcDto {
  param([Parameter(Mandatory=$true)]$Value)
  if ($Value -is [DateTimeOffset]) { return $Value.ToUniversalTime() }
  if ($Value -is [DateTime]) { return ([DateTimeOffset]$Value).ToUniversalTime() }
  return [DateTimeOffset]::Parse([string]$Value).ToUniversalTime()
}

function To-IsoMillis {
  param([Parameter(Mandatory=$true)]$Value)
  return (To-UtcDto $Value).ToString("yyyy-MM-ddTHH:mm:ss.fffZ")
}

# 2) Post milestone events, then repeat them with later timestamps to verify deterministic overwrite behavior.
$now = (Get-Date).ToUniversalTime()

$assign1At = $now
$step1At   = $now.AddSeconds(1)
$assign2At = $now.AddSeconds(2)
$step2At   = $now.AddSeconds(3)

$evt1 = New-FormationEnvelope -visitorId $vid -type "FOLLOWUP_ASSIGNED" -occurredAt $assign1At -data @{ assigneeId = "ops-user-1" } -sourceSystem "assert-formation-milestones-v1"
PostJson "$ApiBase/formation/events" $headers $evt1 | Out-Null

$evt2 = New-FormationEnvelope -visitorId $vid -type "NEXT_STEP_SELECTED" -occurredAt $step1At -data @{ nextStep = "JoinGroup" } -sourceSystem "assert-formation-milestones-v1"
PostJson "$ApiBase/formation/events" $headers $evt2 | Out-Null

$evt3 = New-FormationEnvelope -visitorId $vid -type "FOLLOWUP_ASSIGNED" -occurredAt $assign2At -data @{ assigneeId = "ops-user-2" } -sourceSystem "assert-formation-milestones-v1"
PostJson "$ApiBase/formation/events" $headers $evt3 | Out-Null

$evt4 = New-FormationEnvelope -visitorId $vid -type "NEXT_STEP_SELECTED" -occurredAt $step2At -data @{ nextStep = "ServeTeam" } -sourceSystem "assert-formation-milestones-v1"
PostJson "$ApiBase/formation/events" $headers $evt4 | Out-Null

# 4) Verify profile snapshot (keep assertions minimal + deterministic)
$p = GetJson "$ApiBase/visitors/$vid/formation/profile" $headers
if (-not $p.ok) { throw "Expected ok=true from profile endpoint." }
if (-not $p.profile) { throw "Expected profile to exist after posting events." }

if ([string]::IsNullOrWhiteSpace([string]$p.profile.partitionKey)) { throw "Profile partitionKey missing." }
if ([string]::IsNullOrWhiteSpace([string]$p.profile.rowKey)) { throw "Profile rowKey missing." }

if ($p.profile.stage -ne "Connected") { throw "Expected stage=Connected, got $($p.profile.stage)" }

if (-not $p.profile.stageUpdatedAt) { throw "stageUpdatedAt is required when stage changes" }
try { [void][DateTimeOffset]::Parse($p.profile.stageUpdatedAt) } catch { throw "stageUpdatedAt must be ISO timestamp: $($p.profile.stageUpdatedAt)" }

if ($p.profile.stageUpdatedBy -ne "system") {
  throw "stageUpdatedBy must be 'system' when stage changes (got '$($p.profile.stageUpdatedBy)')"
}

if (-not $p.profile.stageReason -or -not $p.profile.stageReason.StartsWith("event:")) {
  throw "stageReason must start with 'event:' when stage changes (got '$($p.profile.stageReason)')"
}

if ($p.profile.PSObject.Properties.Name -contains "assignedTo") {
  if ($p.profile.assignedTo -ne "ops-user-2") { throw "Expected assignedTo=ops-user-2 after repeated FOLLOWUP_ASSIGNED, got $($p.profile.assignedTo)" }
}

if ($p.profile.PSObject.Properties.Name -contains "lastFollowupAssignedAt") {
  if ((To-IsoMillis $p.profile.lastFollowupAssignedAt) -ne (To-IsoMillis $assign2At)) {
    throw "Expected lastFollowupAssignedAt to match later FOLLOWUP_ASSIGNED timestamp."
  }
}

if ($p.profile.PSObject.Properties.Name -contains "lastNextStepAt") {
  if ((To-IsoMillis $p.profile.lastNextStepAt) -ne (To-IsoMillis $step2At)) {
    throw "Expected lastNextStepAt to match later NEXT_STEP_SELECTED timestamp."
  }
}

if ($p.profile.PSObject.Properties.Name -contains "lastEventType") {
  if ($p.profile.lastEventType -ne "NEXT_STEP_SELECTED") {
    throw "Expected lastEventType=NEXT_STEP_SELECTED after later repeated milestone event, got $($p.profile.lastEventType)"
  }
}

if ($p.profile.PSObject.Properties.Name -contains "lastEventAt") {
  if ((To-IsoMillis $p.profile.lastEventAt) -ne (To-IsoMillis $step2At)) {
    throw "Expected lastEventAt to match later repeated NEXT_STEP_SELECTED timestamp."
  }
}

# 5) Verify profile list endpoints respond (shape/ok)
$outStage = GetJson "$ApiBase/formation/profiles?stage=Connected&limit=10" $headers
if (-not $outStage.ok) { throw "stage filter ok=false" }

$outAssign = GetJson "$ApiBase/formation/profiles?assignedTo=ops-user-1&limit=10" $headers
if (-not $outAssign.ok) { throw "assignedTo filter ok=false" }

$outFast = GetJson "$ApiBase/formation/profiles?visitorId=$vid" $headers
if (-not $outFast.ok) { throw "visitorId fast-path ok=false" }

Write-Host "[assert-formation-milestones-v1] OK" -ForegroundColor Green
