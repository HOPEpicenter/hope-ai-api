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

function NewEvt($vid, $eventId, $type, $at, $data) {
  return @{
    v=1
    eventId=$eventId
    visitorId=$vid
    type=$type
    occurredAt=$at.ToString("o")
    source=@{ system="assert-stage-replay-reconciliation" }
    data=$data
  }
}

function NewVisitor($ApiBase, $headers, $namePrefix) {
  $safePrefix = $namePrefix.ToLowerInvariant() -replace "[^a-z0-9]+", "-"
  $safePrefix = $safePrefix.Trim("-")
  $email = $safePrefix + "+" + (Get-Date -Format "yyyyMMddHHmmssffff") + "@example.com"
  $visitor = PostJson "$ApiBase/visitors" $headers @{ name=$namePrefix; email=$email }
  return $visitor.visitorId
}

$headers = @{ "x-api-key" = $ApiKey }

$base = (Get-Date).ToUniversalTime()
$assignedAt = $base
$connectedAt = $base.AddMinutes(5)

$assignedInOrderEventId = "stage-replay-in-order-assigned-" + [Guid]::NewGuid().ToString()
$connectedInOrderEventId = "stage-replay-in-order-connected-" + [Guid]::NewGuid().ToString()
$assignedOutOfOrderEventId = "stage-replay-out-of-order-assigned-" + [Guid]::NewGuid().ToString()
$connectedOutOfOrderEventId = "stage-replay-out-of-order-connected-" + [Guid]::NewGuid().ToString()
$inOrderVisitorId = NewVisitor $ApiBase $headers "Stage Replay In Order"
$outOfOrderVisitorId = NewVisitor $ApiBase $headers "Stage Replay Out Of Order"

$assignedInOrder = NewEvt $inOrderVisitorId $assignedInOrderEventId "FOLLOWUP_ASSIGNED" $assignedAt @{ assigneeId="ops-1" }
$connectedInOrder = NewEvt $inOrderVisitorId $connectedInOrderEventId "NEXT_STEP_SELECTED" $connectedAt @{ nextStep="Attend Service" }

$assignedOutOfOrder = NewEvt $outOfOrderVisitorId $assignedOutOfOrderEventId "FOLLOWUP_ASSIGNED" $assignedAt @{ assigneeId="ops-1" }
$connectedOutOfOrder = NewEvt $outOfOrderVisitorId $connectedOutOfOrderEventId "NEXT_STEP_SELECTED" $connectedAt @{ nextStep="Attend Service" }

PostJson "$ApiBase/formation/events" $headers $assignedInOrder | Out-Null
PostJson "$ApiBase/formation/events" $headers $connectedInOrder | Out-Null

PostJson "$ApiBase/formation/events" $headers $connectedOutOfOrder | Out-Null
PostJson "$ApiBase/formation/events" $headers $assignedOutOfOrder | Out-Null

$inOrderProfile = GetJson "$ApiBase/visitors/$inOrderVisitorId/formation/profile" $headers
$outOfOrderProfile = GetJson "$ApiBase/visitors/$outOfOrderVisitorId/formation/profile" $headers

$expectedStage = "Connected"
$expectedStageUpdatedAt = [datetime]::Parse($connectedAt.ToString("yyyy-MM-ddTHH:mm:ss.fffZ")).ToUniversalTime()
$expectedStageReason = "event:NEXT_STEP_SELECTED"

if ($inOrderProfile.profile.stage -ne $expectedStage) {
  throw "In-order stage mismatch. Expected $expectedStage, got $($inOrderProfile.profile.stage)"
}

if ($outOfOrderProfile.profile.stage -ne $expectedStage) {
  throw "Out-of-order stage mismatch. Expected $expectedStage, got $($outOfOrderProfile.profile.stage)"
}

$inOrderStageUpdatedAt = ([datetime]$inOrderProfile.profile.stageUpdatedAt).ToUniversalTime()
if ($inOrderStageUpdatedAt -ne $expectedStageUpdatedAt) {
  throw "In-order stageUpdatedAt mismatch. Expected $($expectedStageUpdatedAt.ToString("o")), got $($inOrderStageUpdatedAt.ToString("o"))"
}

$outOfOrderStageUpdatedAt = ([datetime]$outOfOrderProfile.profile.stageUpdatedAt).ToUniversalTime()
if ($outOfOrderStageUpdatedAt -ne $expectedStageUpdatedAt) {
  throw "Out-of-order stageUpdatedAt mismatch. Expected $($expectedStageUpdatedAt.ToString("o")), got $($outOfOrderStageUpdatedAt.ToString("o"))"
}

if ($inOrderProfile.profile.stageReason -ne $expectedStageReason) {
  throw "In-order stageReason mismatch. Expected $expectedStageReason, got $($inOrderProfile.profile.stageReason)"
}

if ($outOfOrderProfile.profile.stageReason -ne $expectedStageReason) {
  throw "Out-of-order stageReason mismatch. Expected $expectedStageReason, got $($outOfOrderProfile.profile.stageReason)"
}

Write-Host "[assert-formation-stage-replay-reconciliation] OK" -ForegroundColor Green




