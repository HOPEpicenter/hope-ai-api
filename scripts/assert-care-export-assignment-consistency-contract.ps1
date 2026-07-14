param(
  [string]$BaseUrl = "http://127.0.0.1:7071",
  [string]$ApiKey = $env:HOPE_API_KEY
)

$ErrorActionPreference = "Stop"

$ApiBase = ($BaseUrl.TrimEnd("/") + "/api")

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

function Post-FormationEvent(
  [string]$VisitorId,
  [string]$Type,
  [datetime]$OccurredAt,
  [hashtable]$Data
) {
  Json-Post "$ApiBase/formation/events" @{
    v = 1
    eventId = New-EventId "evt-care-export-assignment-consistency"
    visitorId = $VisitorId
    type = $Type
    occurredAt = New-IsoUtc $OccurredAt
    source = @{
      system = "assert-care-export-assignment-consistency"
      actorId = "ops-user-1"
    }
    data = $Data
  } | Out-Null
}

function Create-CareCandidate {
  $visitor = Json-Post "$ApiBase/visitors" @{
    name = "Care Export Assignment Consistency $([guid]::NewGuid().ToString('N').Substring(0,8))"
    email = "care-export-assignment-consistency+$([guid]::NewGuid().ToString('N'))@example.com"
    source = "assert-care-export-assignment-consistency-contract.ps1"
  }

  $visitorId = [string]$visitor.visitorId
  Assert (-not [string]::IsNullOrWhiteSpace($visitorId)) "visitorId should be returned"

  $base = (Get-Date).ToUniversalTime().AddMinutes(-5)

  Post-FormationEvent -VisitorId $visitorId -Type "FOLLOWUP_ASSIGNED" -OccurredAt $base -Data @{
    assigneeId = "ops-user-1"
  }

  Post-FormationEvent -VisitorId $visitorId -Type "FOLLOWUP_CONTACTED" -OccurredAt $base.AddSeconds(1) -Data @{
    method = "phone"
  }

  Post-FormationEvent -VisitorId $visitorId -Type "FOLLOWUP_OUTCOME_RECORDED" -OccurredAt $base.AddSeconds(2) -Data @{
    outcome = "needs_care"
  }

  return $visitorId
}

function Get-SummaryPayload($Response) {
  Assert ($Response.ok -eq $true) "summary response should be ok"

  if ($null -ne $Response.summary) {
    return $Response.summary
  }

  return $Response
}

function Assert-CandidateShape($Item, [string]$ExpectedVisitorId) {
  Assert ($null -ne $Item) "candidate item should exist"
  Assert ($Item.visitorId -eq $ExpectedVisitorId) "candidate visitorId should match"
  Assert ($Item.reason -eq "needs_care") "candidate reason should be needs_care"
  Assert ($Item.careCategory -eq "followup_needs_care") "candidate category should be followup_needs_care"
  Assert ($Item.assignmentState -in @("assigned", "unassigned")) "assignmentState should be known"
  Assert ($Item.assignmentBucket -in @("owned", "queue")) "assignmentBucket should be known"
}

Write-Host "Running care export assignment consistency regression..."
Write-Host "ApiBase=$ApiBase"

$visitorId = Create-CareCandidate

Start-Sleep -Milliseconds 750

Json-Post "$ApiBase/care/candidates/$visitorId/assign" @{
  assignedTo = "ops-user-2"
  actorId = "ops-user-1"
} | Out-Null

Start-Sleep -Milliseconds 500

$detail = Json-Get "$ApiBase/care/candidates/$visitorId"
Assert ($detail.ok -eq $true) "candidate detail response should be ok"
Assert ($detail.found -eq $true) "candidate detail should be found"
Assert-CandidateShape $detail.item $visitorId

Assert ($detail.item.assignedTo -eq "ops-user-2") "detail assignedTo should match"
Assert ($detail.item.assignmentState -eq "assigned") "detail assignmentState should be assigned"
Assert ($detail.item.assignmentBucket -eq "owned") "detail assignmentBucket should be owned"

$list = Json-Get "$ApiBase/care/export?assignmentState=assigned&assignmentBucket=owned"
Assert ($list.ok -eq $true) "care export assigned response should be ok"
Assert ($null -ne $list.items) "care export assigned items should exist"

foreach ($item in @($list.items)) {
  Assert ($item.assignmentState -eq "assigned") "assigned filtered list item should be assigned"
  Assert ($item.assignmentBucket -eq "owned") "owned filtered list item should be owned"
}

$summaryResponse = Json-Get "$ApiBase/care/summary?assignmentState=assigned&assignmentBucket=owned"
$summary = Get-SummaryPayload $summaryResponse

Assert ([int]$summary.filteredCount -ge 1) "summary filteredCount should include assigned owned candidate"
Assert ([int]$summary.assignedCount -ge [int]$summary.filteredCount) "summary assignedCount should cover filtered candidates"
Assert ([int]$summary.ownedCount -ge [int]$summary.filteredCount) "summary ownedCount should cover filtered candidates"
Assert ([int]$summary.byAssignmentState.assigned -eq [int]$summary.assignedCount) "summary byAssignmentState.assigned should match assignedCount"
Assert ([int]$summary.byAssignmentBucket.owned -eq [int]$summary.ownedCount) "summary byAssignmentBucket.owned should match ownedCount"

Json-Post "$ApiBase/care/candidates/$visitorId/unassign" @{ actorId = "ops-user-1" } | Out-Null

Start-Sleep -Milliseconds 500

$unassignedDetail = Json-Get "$ApiBase/care/candidates/$visitorId"
Assert ($unassignedDetail.ok -eq $true) "unassigned candidate detail response should be ok"
Assert ($unassignedDetail.found -eq $true) "unassigned candidate detail should be found"
Assert-CandidateShape $unassignedDetail.item $visitorId
Assert ($null -eq $unassignedDetail.item.assignedTo) "unassigned detail assignedTo should be null"
Assert ($unassignedDetail.item.assignmentState -eq "unassigned") "unassigned detail assignmentState should be unassigned"
Assert ($unassignedDetail.item.assignmentBucket -eq "queue") "unassigned detail assignmentBucket should be queue"

$unassignedList = Json-Get "$ApiBase/care/export?assignmentState=unassigned&assignmentBucket=queue"
Assert ($unassignedList.ok -eq $true) "unassigned care export assigned response should be ok"

foreach ($item in @($unassignedList.items)) {
  Assert ($item.assignmentState -eq "unassigned") "unassigned filtered list item should be unassigned"
  Assert ($item.assignmentBucket -eq "queue") "queue filtered list item should be queue"
}

$queueSummaryResponse = Json-Get "$ApiBase/care/summary?assignmentState=unassigned&assignmentBucket=queue"
$queueSummary = Get-SummaryPayload $queueSummaryResponse

Assert ([int]$queueSummary.filteredCount -ge 1) "queue summary filteredCount should include unassigned queue candidate"
Assert ([int]$queueSummary.unassignedCount -ge 1) "queue summary unassignedCount should be at least 1"
Assert ([int]$queueSummary.queueCount -ge 1) "queue summary queueCount should be at least 1"
Assert ([int]$queueSummary.byAssignmentState.unassigned -eq [int]$queueSummary.unassignedCount) "summary byAssignmentState.unassigned should match unassignedCount"
Assert ([int]$queueSummary.byAssignmentBucket.queue -eq [int]$queueSummary.queueCount) "summary byAssignmentBucket.queue should match queueCount"

Write-Host "OK: care export assignment consistency regression passed."



