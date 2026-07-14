param(
  [string]$BaseUrl = "http://127.0.0.1:7071",
  [string]$ApiKey = $env:HOPE_API_KEY
)

$ErrorActionPreference = "Stop"

$ApiBase = ($BaseUrl.TrimEnd("/") + "/api").Replace("/api/api", "/api")

$headers = @{
  "content-type" = "application/json"
}

if (-not [string]::IsNullOrWhiteSpace($ApiKey)) {
  $headers["x-api-key"] = $ApiKey
}

function Assert($Condition, [string]$Message) {
  if (-not $Condition) {
    throw "ASSERT FAILED: $Message"
  }
}

function Json-Post([string]$Url, [hashtable]$Body) {
  Invoke-RestMethod -Method Post -Uri $Url -Headers $headers -ContentType "application/json" -Body ($Body | ConvertTo-Json -Depth 30)
}

function Json-Get([string]$Url) {
  Invoke-RestMethod -Method Get -Uri $Url -Headers $headers
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

function Post-FormationEvent(
  [string]$VisitorId,
  [string]$Type,
  [datetime]$OccurredAt,
  [hashtable]$Data
) {
  Json-Post "$ApiBase/formation/events" @{
    v = 1
    eventId = New-EventId "evt-care-summary-export-list"
    visitorId = $VisitorId
    type = $Type
    occurredAt = New-IsoUtc $OccurredAt
    source = @{
      system = "assert-care-summary-export-list-consistency"
      actorId = "ops-user-1"
    }
    data = $Data
  } | Out-Null
}

function New-CareCandidate([string]$Label, [string]$InitialOwner) {
  $visitor = Json-Post "$ApiBase/visitors" @{
    name = "Care Summary Export List $Label $([guid]::NewGuid().ToString('N').Substring(0,8))"
    email = "care-summary-export-list+$([guid]::NewGuid().ToString('N'))@example.com"
    source = "assert-care-summary-export-list-consistency-contract.ps1"
  }

  $visitorId = [string]$visitor.visitorId
  Assert (-not [string]::IsNullOrWhiteSpace($visitorId)) "$Label visitorId should be returned"

  $base = (Get-Date).ToUniversalTime().AddMinutes(-5)

  Post-FormationEvent -VisitorId $visitorId -Type "FOLLOWUP_ASSIGNED" -OccurredAt $base -Data @{
    assigneeId = $InitialOwner
  }

  Post-FormationEvent -VisitorId $visitorId -Type "FOLLOWUP_CONTACTED" -OccurredAt $base.AddSeconds(1) -Data @{
    method = "phone"
  }

  Post-FormationEvent -VisitorId $visitorId -Type "FOLLOWUP_OUTCOME_RECORDED" -OccurredAt $base.AddSeconds(2) -Data @{
    outcome = "needs_care"
  }

  return $visitorId
}

function Find-ItemByVisitorId($Items, [string]$VisitorId) {
  @($Items) | Where-Object { [string]$_.visitorId -eq $VisitorId } | Select-Object -First 1
}

function Get-SummaryPayload($Response) {
  Assert ($Response.ok -eq $true) "summary response should be ok"

  if ($null -ne $Response.summary) {
    return $Response.summary
  }

  return $Response
}

function Get-ListItems([string]$AssignmentState, [string]$AssignmentBucket) {
  $items = @()
  $cursor = $null

  do {
    $url = "$ApiBase/care/candidates?assignmentState=$AssignmentState&assignmentBucket=$AssignmentBucket&limit=500"
    if (-not [string]::IsNullOrWhiteSpace([string]$cursor)) {
      $url = "$url&cursor=$(Enc ([string]$cursor))"
    }

    $page = Json-Get $url
    Assert ($page.ok -eq $true) "care list response should be ok for $AssignmentState/$AssignmentBucket"

    $items += @($page.items)
    $cursor = $page.nextCursor
  } while (-not [string]::IsNullOrWhiteSpace([string]$cursor))

  return $items
}

function Get-ExportItems([string]$AssignmentState, [string]$AssignmentBucket) {
  $export = Json-Get "$ApiBase/care/export?assignmentState=$AssignmentState&assignmentBucket=$AssignmentBucket"
  Assert ($export.ok -eq $true) "care export response should be ok for $AssignmentState/$AssignmentBucket"
  return @($export.items)
}

function Assert-ItemShape($Item, [string]$VisitorId, [string]$AssignmentState, [string]$AssignmentBucket, [string]$Surface) {
  Assert ($null -ne $Item) "$Surface should contain visitor $VisitorId"
  Assert ([string]$Item.reason -eq "needs_care") "$Surface reason should be needs_care"
  Assert ([string]$Item.careCategory -eq "followup_needs_care") "$Surface careCategory should be followup_needs_care"
  Assert ([string]$Item.assignmentState -eq $AssignmentState) "$Surface assignmentState should be $AssignmentState"
  Assert ([string]$Item.assignmentBucket -eq $AssignmentBucket) "$Surface assignmentBucket should be $AssignmentBucket"
}

function Assert-SurfaceConsistency([string]$AssignmentState, [string]$AssignmentBucket, [string[]]$ExpectedVisitorIds) {
  $listItems = @(Get-ListItems $AssignmentState $AssignmentBucket)
  $exportItems = @(Get-ExportItems $AssignmentState $AssignmentBucket)

  $summaryResponse = Json-Get "$ApiBase/care/summary?assignmentState=$AssignmentState&assignmentBucket=$AssignmentBucket"
  $summary = Get-SummaryPayload $summaryResponse

  Assert ([int]$summary.filteredCount -eq $listItems.Count) "summary filteredCount should equal list count for $AssignmentState/$AssignmentBucket"
  Assert ([int]$summary.filteredCount -eq $exportItems.Count) "summary filteredCount should equal export count for $AssignmentState/$AssignmentBucket"

  if ($AssignmentState -eq "assigned") {
    Assert ([int]$summary.byAssignmentState.assigned -eq [int]$summary.assignedCount) "assigned summary byAssignmentState should match assignedCount"
    Assert ([int]$summary.assignedCount -ge [int]$summary.filteredCount) "assignedCount should cover filtered assigned candidates"
  } else {
    Assert ([int]$summary.byAssignmentState.unassigned -eq [int]$summary.unassignedCount) "unassigned summary byAssignmentState should match unassignedCount"
    Assert ([int]$summary.unassignedCount -ge [int]$summary.filteredCount) "unassignedCount should cover filtered unassigned candidates"
  }

  if ($AssignmentBucket -eq "owned") {
    Assert ([int]$summary.byAssignmentBucket.owned -eq [int]$summary.ownedCount) "owned summary byAssignmentBucket should match ownedCount"
    Assert ([int]$summary.ownedCount -ge [int]$summary.filteredCount) "ownedCount should cover filtered owned candidates"
  } else {
    Assert ([int]$summary.byAssignmentBucket.queue -eq [int]$summary.queueCount) "queue summary byAssignmentBucket should match queueCount"
    Assert ([int]$summary.queueCount -ge [int]$summary.filteredCount) "queueCount should cover filtered queue candidates"
  }

  foreach ($visitorId in $ExpectedVisitorIds) {
    $listItem = Find-ItemByVisitorId $listItems $visitorId
    $exportItem = Find-ItemByVisitorId $exportItems $visitorId

    Assert-ItemShape $listItem $visitorId $AssignmentState $AssignmentBucket "care list $AssignmentState/$AssignmentBucket"
    Assert-ItemShape $exportItem $visitorId $AssignmentState $AssignmentBucket "care export $AssignmentState/$AssignmentBucket"
  }
}

Write-Host "Running care summary/export/list consistency regression..."
Write-Host "ApiBase=$ApiBase"

$assignedVisitorId = New-CareCandidate "Assigned" "ops-user-1"
$queueVisitorId = New-CareCandidate "Queue" "ops-user-1"

Start-Sleep -Milliseconds 750

Json-Post "$ApiBase/care/candidates/$assignedVisitorId/assign" @{
  assignedTo = "ops-user-2"
  actorId = "ops-user-1"
} | Out-Null

Json-Post "$ApiBase/care/candidates/$queueVisitorId/unassign" @{ actorId = "ops-user-1" } | Out-Null

Start-Sleep -Milliseconds 500

Assert-SurfaceConsistency "assigned" "owned" @($assignedVisitorId)
Assert-SurfaceConsistency "unassigned" "queue" @($queueVisitorId)

Write-Host "OK: care summary/export/list consistency regression passed."
