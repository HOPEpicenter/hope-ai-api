param(
  [string]$BaseUrl = "http://127.0.0.1:7071",
  [string]$ApiKey = $env:HOPE_API_KEY
)

$ErrorActionPreference = "Stop"

$RootBase = $BaseUrl.TrimEnd("/")
if ($RootBase -match "/api$") {
  $ApiBase = $RootBase
} else {
  $ApiBase = "$RootBase/api"
}

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
    eventId = New-EventId "evt-care-assignment-summary"
    visitorId = $VisitorId
    type = $Type
    occurredAt = New-IsoUtc $OccurredAt
    source = @{
      system = "assert-care-assignment-summary"
      actorId = "ops-user-1"
    }
    data = $Data
  } | Out-Null
}

function Create-TestVisitor {
  $visitor = Json-Post "$ApiBase/visitors" @{
    name = "Care Assignment Summary $([guid]::NewGuid().ToString('N').Substring(0,8))"
    email = "care-assignment-summary+$([guid]::NewGuid().ToString('N'))@example.com"
    source = "assert-care-assignment-summary-contract.ps1"
  }

  Assert (-not [string]::IsNullOrWhiteSpace([string]$visitor.visitorId)) "visitorId should be returned"
  return [string]$visitor.visitorId
}

function Seed-CareCandidate {
  $visitorId = Create-TestVisitor
  $base = (Get-Date).ToUniversalTime().AddMinutes(-5)

  Post-FormationEvent -VisitorId $visitorId -Type "FOLLOWUP_ASSIGNED" -OccurredAt $base -Data @{
    assigneeId = "ops-user-1"
  }

  Post-FormationEvent -VisitorId $visitorId -Type "FOLLOWUP_CONTACTED" -OccurredAt $base.AddSeconds(1) -Data @{
    method = "phone"
    result = "connected"
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

function Assert-SummaryReadable($Summary) {
  Assert ($null -ne $Summary.totalCandidates) "summary totalCandidates should exist"
  Assert ($null -ne $Summary.assignedCount) "summary assignedCount should exist"
  Assert ($null -ne $Summary.unassignedCount) "summary unassignedCount should exist"
  Assert ($null -ne $Summary.ownedCount) "summary ownedCount should exist"
  Assert ($null -ne $Summary.queueCount) "summary queueCount should exist"
}

Write-Host "Running care assignment summary regression..."
Write-Host "ApiBase=$ApiBase"

$visitorId = Seed-CareCandidate

Start-Sleep -Milliseconds 500

$initialSummaryResponse = Json-Get "$ApiBase/care/summary"
$initialSummary = Get-SummaryPayload $initialSummaryResponse
Assert-SummaryReadable $initialSummary

$assign = Json-Post "$ApiBase/care/candidates/$visitorId/assign" @{
  assignedTo = "ops-user-2"
}

Assert ($assign.ok -eq $true) "assign response should be ok"

Start-Sleep -Milliseconds 250

$assignedSummaryResponse = Json-Get "$ApiBase/care/summary?assignmentState=assigned&assignmentBucket=owned"
$assignedSummary = Get-SummaryPayload $assignedSummaryResponse
Assert-SummaryReadable $assignedSummary

Assert ([int]$assignedSummary.filteredCount -ge 1) "assigned/owned filtered summary should include at least one candidate"
Assert ([int]$assignedSummary.assignedCount -ge 1) "assigned/owned summary assignedCount should be at least 1"
Assert ([int]$assignedSummary.ownedCount -ge 1) "assigned/owned summary ownedCount should be at least 1"

$unassign = Json-Post "$ApiBase/care/candidates/$visitorId/unassign" @{}

Assert ($unassign.ok -eq $true) "unassign response should be ok"

Start-Sleep -Milliseconds 250

$queueSummaryResponse = Json-Get "$ApiBase/care/summary?assignmentState=unassigned&assignmentBucket=queue"
$queueSummary = Get-SummaryPayload $queueSummaryResponse
Assert-SummaryReadable $queueSummary

Assert ([int]$queueSummary.filteredCount -ge 1) "unassigned/queue filtered summary should include at least one candidate"
Assert ([int]$queueSummary.unassignedCount -ge 1) "unassigned/queue summary unassignedCount should be at least 1"
Assert ([int]$queueSummary.queueCount -ge 1) "unassigned/queue summary queueCount should be at least 1"

Write-Host "OK: care assignment summary regression passed."


