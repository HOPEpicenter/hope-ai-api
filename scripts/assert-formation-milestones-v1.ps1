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

# 2) Post FOLLOWUP_ASSIGNED (data.assigneeId required)
$now = (Get-Date).ToUniversalTime()
$evt1 = New-FormationEnvelope -visitorId $vid -type "FOLLOWUP_ASSIGNED" -occurredAt $now -data @{ assigneeId = "ops-user-1" } -sourceSystem "assert-formation-milestones-v1"
PostJson "$ApiBase/formation/events" $headers $evt1 | Out-Null

# 3) Post NEXT_STEP_SELECTED (data.nextStep required)
$evt2 = New-FormationEnvelope -visitorId $vid -type "NEXT_STEP_SELECTED" -occurredAt $now.AddSeconds(1) -data @{ nextStep = "JoinGroup" } -sourceSystem "assert-formation-milestones-v1"
PostJson "$ApiBase/formation/events" $headers $evt2 | Out-Null

# 4) Verify profile snapshot (keep assertions minimal + stable)
$p = GetJson "$ApiBase/visitors/$vid/formation/profile" $headers
if (-not $p.ok) { throw "Expected ok=true from profile endpoint." }
if (-not $p.profile) { throw "Expected profile to exist after posting events." }

# required snapshot keys (see existing profile assert)
if ([string]::IsNullOrWhiteSpace([string]$p.profile.partitionKey)) { throw "Profile partitionKey missing." }
if ([string]::IsNullOrWhiteSpace([string]$p.profile.rowKey)) { throw "Profile rowKey missing." }

# stage should be Connected after NEXT_STEP_SELECTED
if ($p.profile.stage -ne "Connected") { throw "Expected stage=Connected, got $($p.profile.stage)" }

# Optional checks (only enforce if fields exist)
if ($p.profile.PSObject.Properties.Name -contains "assignedTo" -and $null -ne $p.profile.assignedTo) {
  if ($p.profile.assignedTo -ne "ops-user-1") { throw "Expected assignedTo=ops-user-1, got $($p.profile.assignedTo)" }
}

# 5) Verify profile list endpoints respond (shape/ok)
$outStage = GetJson "$ApiBase/formation/profiles?stage=Connected&limit=10" $headers
if (-not $outStage.ok) { throw "stage filter ok=false" }

$outAssign = GetJson "$ApiBase/formation/profiles?assignedTo=ops-user-1&limit=10" $headers
if (-not $outAssign.ok) { throw "assignedTo filter ok=false" }

$outFast = GetJson "$ApiBase/formation/profiles?visitorId=$vid" $headers
if (-not $outFast.ok) { throw "visitorId fast-path ok=false" }

Write-Host "[assert-formation-milestones-v1] OK" -ForegroundColor Green
