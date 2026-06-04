param(
  [string]$BaseUrl = "http://127.0.0.1:7071",
  [string]$ApiKey = $env:HOPE_API_KEY
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

if ([string]::IsNullOrWhiteSpace($ApiKey)) {
  throw "HOPE_API_KEY is required."
}

$ApiBase = ($BaseUrl.TrimEnd("/") + "/api").Replace("/api/api", "/api")
$Base = $ApiBase.Replace("/api", "")
$headers = @{ "x-api-key" = $ApiKey; "content-type" = "application/json" }

function Assert($Condition, [string]$Message) {
  if (-not $Condition) { throw "ASSERT FAILED: $Message" }
}

function Json-Get([string]$Url) {
  Invoke-RestMethod -Method Get -Uri $Url -Headers $headers
}

function Json-Post([string]$Url, [object]$Body) {
  Invoke-RestMethod -Method Post -Uri $Url -Headers $headers -ContentType "application/json" -Body ($Body | ConvertTo-Json -Depth 30)
}

function New-EventId([string]$Prefix) {
  "$Prefix-$([guid]::NewGuid().ToString('N'))"
}

function New-IsoUtc([datetime]$Value) {
  $Value.ToUniversalTime().ToString("o")
}

function Enc([string]$Value) {
  [Uri]::EscapeDataString($Value)
}

function Post-FormationEvent([string]$VisitorId, [string]$Type, [datetime]$OccurredAt, [hashtable]$Data) {
  Json-Post "$ApiBase/formation/events" @{
    v = 1
    eventId = New-EventId "evt-care-cross-surface"
    visitorId = $VisitorId
    type = $Type
    occurredAt = New-IsoUtc $OccurredAt
    source = @{
      system = "assert-care-cross-surface-derivation-contract"
      actorId = "ops-user-1"
    }
    data = $Data
  } | Out-Null
}

function Find-ItemByVisitorId($Items, [string]$VisitorId) {
  @($Items) | Where-Object { [string]$_.visitorId -eq $VisitorId } | Select-Object -First 1
}

function Get-Profile([string]$VisitorId) {
  $response = Json-Get "$ApiBase/visitors/$(Enc $VisitorId)/formation/profile"
  return $response.profile
}

function Get-CareDetail([string]$VisitorId) {
  Json-Get "$ApiBase/care/candidates/$(Enc $VisitorId)"
}

function Get-CareListItem([string]$VisitorId, [string]$AssignmentState, [string]$AssignmentBucket) {
  $cursor = $null

  do {
    $url = "$ApiBase/care/candidates?assignmentState=$AssignmentState&assignmentBucket=$AssignmentBucket&limit=500"
    if (-not [string]::IsNullOrWhiteSpace([string]$cursor)) {
      $url = "$url&cursor=$(Enc ([string]$cursor))"
    }

    $page = Json-Get $url
    Assert ($page.ok -eq $true) "care candidate list response should be ok"

    $item = Find-ItemByVisitorId $page.items $VisitorId
    if ($null -ne $item) { return $item }

    $cursor = $page.nextCursor
  } while (-not [string]::IsNullOrWhiteSpace([string]$cursor))

  return $null
}

function Get-CareExportItem([string]$VisitorId, [string]$AssignmentState, [string]$AssignmentBucket) {
  $export = Json-Get "$ApiBase/care/export?assignmentState=$AssignmentState&assignmentBucket=$AssignmentBucket"
  Assert ($export.ok -eq $true) "care export response should be ok"
  return Find-ItemByVisitorId $export.items $VisitorId
}

function Get-OpsFollowup([string]$VisitorId) {
  $ops = Json-Get "$ApiBase/ops/followups?visitorId=$(Enc $VisitorId)&includeResolved=true&limit=10"
  Assert ($ops.ok -eq $true) "ops followups response should be ok"
  return Find-ItemByVisitorId $ops.items $VisitorId
}

function Assert-CareCandidate($Item, [string]$VisitorId, [string]$AssignedTo, [string]$AssignmentState, [string]$AssignmentBucket, [string]$Surface) {
  Assert ($null -ne $Item) "$Surface item should exist"
  Assert ([string]$Item.visitorId -eq $VisitorId) "$Surface visitorId should match"
  Assert ([string]$Item.reason -eq "needs_care") "$Surface reason should be needs_care"
  Assert ([string]$Item.careCategory -eq "followup_needs_care") "$Surface careCategory should be followup_needs_care"
  Assert ([string]$Item.assignmentState -eq $AssignmentState) "$Surface assignmentState should be $AssignmentState"
  Assert ([string]$Item.assignmentBucket -eq $AssignmentBucket) "$Surface assignmentBucket should be $AssignmentBucket"

  if ([string]::IsNullOrWhiteSpace($AssignedTo)) {
    Assert ($null -eq $Item.assignedTo -or [string]$Item.assignedTo -eq "") "$Surface assignedTo should be empty"
  } else {
    Assert ([string]$Item.assignedTo -eq $AssignedTo) "$Surface assignedTo should be $AssignedTo"
  }
}

Write-Host "Running care cross-surface derivation regression..."
Write-Host "ApiBase=$ApiBase"

$visitor = Json-Post "$ApiBase/visitors" @{
  name = "Care Cross Surface Derivation $([guid]::NewGuid().ToString('N').Substring(0,8))"
  email = "care-cross-surface+$([guid]::NewGuid().ToString('N'))@example.com"
  source = "assert-care-cross-surface-derivation-contract.ps1"
}

$visitorId = [string]$visitor.visitorId
Assert (-not [string]::IsNullOrWhiteSpace($visitorId)) "visitorId should be returned"

$baseTime = (Get-Date).ToUniversalTime().AddMinutes(-10)

Post-FormationEvent -VisitorId $visitorId -Type "FOLLOWUP_ASSIGNED" -OccurredAt $baseTime -Data @{
  assigneeId = "ops-user-1"
}

Post-FormationEvent -VisitorId $visitorId -Type "FOLLOWUP_CONTACTED" -OccurredAt $baseTime.AddSeconds(1) -Data @{
  method = "phone"
  result = "connected"
}

Post-FormationEvent -VisitorId $visitorId -Type "FOLLOWUP_OUTCOME_RECORDED" -OccurredAt $baseTime.AddSeconds(2) -Data @{
  outcome = "needs_care"
}

Start-Sleep -Milliseconds 750

$profile = Get-Profile $visitorId
Assert ([string]$profile.lastFollowupOutcome -eq "needs_care") "profile lastFollowupOutcome should be needs_care"
Assert ([string]$profile.assignedTo -eq "ops-user-1") "profile assignedTo should start as ops-user-1"

$detail = Get-CareDetail $visitorId
Assert ($detail.ok -eq $true) "care detail response should be ok"
Assert ($detail.found -eq $true) "care detail should be found"
Assert-CareCandidate $detail.item $visitorId "ops-user-1" "assigned" "owned" "care detail"

$listItem = Get-CareListItem $visitorId "assigned" "owned"
Assert-CareCandidate $listItem $visitorId "ops-user-1" "assigned" "owned" "care list"

$summary = Json-Get "$ApiBase/care/summary?assignmentState=assigned&assignmentBucket=owned"
Assert ($summary.ok -eq $true) "care summary response should be ok"
$summaryPayload = if ($null -ne $summary.summary) { $summary.summary } else { $summary }
Assert ([int]$summaryPayload.filteredCount -ge 1) "care summary filteredCount should include assigned owned candidate"
Assert ([int]$summaryPayload.byAssignmentState.assigned -ge 1) "care summary assigned bucket should include candidate"
Assert ([int]$summaryPayload.byAssignmentBucket.owned -ge 1) "care summary owned bucket should include candidate"

$exportItem = Get-CareExportItem $visitorId "assigned" "owned"
Assert-CareCandidate $exportItem $visitorId "ops-user-1" "assigned" "owned" "care export"

$opsItem = Get-OpsFollowup $visitorId
Assert ($null -ne $opsItem) "visitor should appear in ops followups includeResolved=true"
Assert ($opsItem.followupResolved -eq $false) "ops followup should remain unresolved for needs_care"
Assert ([string]$opsItem.assignedTo.ownerId -eq "ops-user-1") "ops followup owner should match profile owner"

Json-Post "$ApiBase/care/candidates/$(Enc $visitorId)/assign" @{
  assignedTo = "ops-user-2"
} | Out-Null

Start-Sleep -Milliseconds 500

$assignedProfile = Get-Profile $visitorId
Assert ([string]$assignedProfile.assignedTo -eq "ops-user-2") "profile should reflect reassigned owner"

$assignedDetail = Get-CareDetail $visitorId
Assert-CareCandidate $assignedDetail.item $visitorId "ops-user-2" "assigned" "owned" "assigned care detail"

$assignedListItem = Get-CareListItem $visitorId "assigned" "owned"
Assert-CareCandidate $assignedListItem $visitorId "ops-user-2" "assigned" "owned" "assigned care list"

$assignedExportItem = Get-CareExportItem $visitorId "assigned" "owned"
Assert-CareCandidate $assignedExportItem $visitorId "ops-user-2" "assigned" "owned" "assigned care export"

Json-Post "$ApiBase/care/candidates/$(Enc $visitorId)/unassign" @{} | Out-Null

Start-Sleep -Milliseconds 500

$unassignedDetail = Get-CareDetail $visitorId
Assert-CareCandidate $unassignedDetail.item $visitorId "" "unassigned" "queue" "unassigned care detail"

$unassignedListItem = Get-CareListItem $visitorId "unassigned" "queue"
Assert-CareCandidate $unassignedListItem $visitorId "" "unassigned" "queue" "unassigned care list"

$unassignedExportItem = Get-CareExportItem $visitorId "unassigned" "queue"
Assert-CareCandidate $unassignedExportItem $visitorId "" "unassigned" "queue" "unassigned care export"

Write-Host "OK: care cross-surface derivation regression passed."


