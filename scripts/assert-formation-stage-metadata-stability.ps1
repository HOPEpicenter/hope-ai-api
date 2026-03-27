param(
  [Parameter(Mandatory=$true)][string]$ApiBase,
  [Parameter(Mandatory=$true)][string]$ApiKey
)

$ErrorActionPreference = "Stop"

function PostJson($url, $headers, $body) {
  Invoke-RestMethod -Method Post -Uri $url -Headers $headers -ContentType "application/json" -Body ($body | ConvertTo-Json -Depth 20)
}

function GetJson($url, $headers) {
  Invoke-RestMethod -Method Get -Uri $url -Headers $headers
}

function NewEvt($vid, $type, $at, $data) {
  return @{
    v=1
    eventId=[Guid]::NewGuid().ToString()
    visitorId=$vid
    type=$type
    occurredAt=$at.ToString("o")
    source=@{ system="assert-stage-stability" }
    data=$data
  }
}

$headers = @{ "x-api-key" = $ApiKey }

# Create visitor
$email = "stage-stability+" + (Get-Date -Format "yyyyMMddHHmmss") + "@example.com"
$v = PostJson "$ApiBase/visitors" $headers @{ name="Stage Stability"; email=$email }
$vid = $v.visitorId

# First event → causes stage change
$now = (Get-Date).ToUniversalTime()
PostJson "$ApiBase/formation/events" $headers (NewEvt $vid "FOLLOWUP_ASSIGNED" $now @{ assigneeId="ops-1" }) | Out-Null

$p1 = GetJson "$ApiBase/visitors/$vid/formation/profile" $headers

$stageUpdatedAt1 = $p1.profile.stageUpdatedAt
$stageReason1 = $p1.profile.stageReason

# Second event (same stage)
PostJson "$ApiBase/formation/events" $headers (NewEvt $vid "NEXT_STEP_SELECTED" ($now.AddSeconds(5)) @{ nextStep="Test" }) | Out-Null

$p2 = GetJson "$ApiBase/visitors/$vid/formation/profile" $headers

if ($p2.profile.stageUpdatedAt -ne $stageUpdatedAt1) {
  throw "stageUpdatedAt changed without stage change"
}

if ($p2.profile.stageReason -ne $stageReason1) {
  throw "stageReason changed without stage change"
}

Write-Host "[assert-formation-stage-metadata-stability] OK" -ForegroundColor Green

