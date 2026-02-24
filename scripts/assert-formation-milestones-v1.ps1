param(
  [Parameter(Mandatory=$true)][string]$ApiBase,
  [Parameter(Mandatory=$true)][string]$ApiKey
)

$ErrorActionPreference = "Stop"

function PostJson([string]$url, $headers, $body) {
  Invoke-RestMethod -Method Post -Uri $url -Headers $headers -ContentType "application/json" -Body ($body | ConvertTo-Json -Depth 10)
}

function GetJson([string]$url, $headers) {
  Invoke-RestMethod -Method Get -Uri $url -Headers $headers
}

$headers = @{ "x-api-key" = $ApiKey }

# 1) Create visitor
$email = "formation-milestones+" + (Get-Date -Format "yyyyMMddHHmmss") + "@example.com"
$cv = PostJson "$ApiBase/visitors" $headers @{ name = "Formation Milestones"; email = $email }
if (-not $cv.ok) { throw "create visitor failed" }
$vid = $cv.visitorId
Write-Host "[assert-formation-milestones-v1] visitorId=$vid"

# 2) Post FOLLOWUP_ASSIGNED (assigneeId required)
$now = Get-Date
$evt1 = @{
  v = 1
  eventId = [Guid]::NewGuid().ToString()
  visitorId = $vid
  type = "FOLLOWUP_ASSIGNED"
  occurredAt = $now.ToString("o")
  source = @{ system = "assert-formation-milestones-v1" }
  data = @{ assigneeId = "ops-user-1" }
}
PostJson "$ApiBase/formation/events" $headers $evt1 | Out-Null

# 3) Post NEXT_STEP_SELECTED (nextStep required)
$evt2 = @{
  v = 1
  eventId = [Guid]::NewGuid().ToString()
  visitorId = $vid
  type = "NEXT_STEP_SELECTED"
  occurredAt = $now.AddSeconds(1).ToString("o")
  source = @{ system = "assert-formation-milestones-v1" }
  data = @{ nextStep = "JoinGroup" }
}
PostJson "$ApiBase/formation/events" $headers $evt2 | Out-Null

# 4) Verify profile derivations
$p = GetJson "$ApiBase/visitors/$vid/formation/profile" $headers
if (-not $p.ok) { throw "profile ok=false" }

# NOTE: Adjust these property names to match actual API response shape.
# These are the intended v1 contract assertions:
if ($p.profile.stage -ne "Connected") { throw "expected stage=Connected, got $($p.profile.stage)" }
if ($p.profile.assignedTo -ne "ops-user-1") { throw "expected assignedTo=ops-user-1, got $($p.profile.assignedTo)" }
if ($p.profile.nextStep -ne "JoinGroup") { throw "expected nextStep=JoinGroup, got $($p.profile.nextStep)" }

# 5) Verify profile list filters respond (shape/ok)
$outStage = GetJson "$ApiBase/formation/profiles?stage=Connected&limit=10" $headers
if (-not $outStage.ok) { throw "stage filter ok=false" }

$outAssign = GetJson "$ApiBase/formation/profiles?assignedTo=ops-user-1&limit=10" $headers
if (-not $outAssign.ok) { throw "assignedTo filter ok=false" }

Write-Host "[assert-formation-milestones-v1] OK" -ForegroundColor Green
