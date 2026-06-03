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

function Create-TestVisitor([string]$Label) {
  $visitor = Json-Post "$ApiBase/visitors" @{
    name = "Care Bulk Unassign $Label $([guid]::NewGuid().ToString('N').Substring(0,8))"
    email = "care-bulk-unassign-$($Label.ToLower())+$([guid]::NewGuid().ToString('N'))@example.com"
    source = "assert-care-candidate-unassign-bulk-command-contract.ps1"
  }

  Assert (-not [string]::IsNullOrWhiteSpace([string]$visitor.visitorId)) "$Label visitorId should be returned"
  return [string]$visitor.visitorId
}

function Post-FormationEvent(
  [string]$VisitorId,
  [string]$Type,
  [datetime]$OccurredAt,
  [hashtable]$Data
) {
  Json-Post "$ApiBase/formation/events" @{
    v = 1
    eventId = New-EventId "evt-care-bulk-unassign"
    visitorId = $VisitorId
    type = $Type
    occurredAt = New-IsoUtc $OccurredAt
    source = @{
      system = "assert-care-candidate-unassign-bulk-command"
      actorId = "ops-user-1"
    }
    data = $Data
  } | Out-Null
}

function Seed-CareCandidate([string]$Label) {
  $visitorId = Create-TestVisitor $Label
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

Write-Host "Running care candidate bulk unassign command E2E contract..."
Write-Host "ApiBase=$ApiBase"

$visitorA = Seed-CareCandidate "A"
$visitorB = Seed-CareCandidate "B"
$missingVisitor = "missing-care-bulk-unassign-$([guid]::NewGuid().ToString('N'))"

Start-Sleep -Milliseconds 500

$assignResponse = Json-Post "$ApiBase/care/candidates/assign-bulk" @{
  visitorIds = @($visitorA, $visitorB)
  assignedTo = "ops-user-2"
}

Assert ($assignResponse.ok -eq $true) "bulk assign setup should be ok"

$unassignResponse = Json-Post "$ApiBase/care/candidates/unassign-bulk" @{
  visitorIds = @($visitorA, $visitorB, $missingVisitor)
}

Assert ($unassignResponse.ok -eq $true) "bulk unassign response should be ok"
Assert (@($unassignResponse.results).Count -eq 3) "bulk unassign should return one result per visitorId"

$resultA = @($unassignResponse.results) | Where-Object { [string]$_.visitorId -eq $visitorA } | Select-Object -First 1
$resultB = @($unassignResponse.results) | Where-Object { [string]$_.visitorId -eq $visitorB } | Select-Object -First 1
$resultMissing = @($unassignResponse.results) | Where-Object { [string]$_.visitorId -eq $missingVisitor } | Select-Object -First 1

Assert ($null -ne $resultA) "visitor A result should exist"
Assert ($null -ne $resultB) "visitor B result should exist"
Assert ($null -ne $resultMissing) "missing visitor result should exist"

Assert ($resultA.found -eq $true) "visitor A should be found"
Assert ($resultA.unassigned -eq $true) "visitor A should be unassigned"
Assert ($resultB.found -eq $true) "visitor B should be found"
Assert ($resultB.unassigned -eq $true) "visitor B should be unassigned"
Assert ($resultMissing.found -eq $false) "missing visitor should not be found"
Assert ($resultMissing.unassigned -eq $false) "missing visitor should not be unassigned"

$detailA = Json-Get "$ApiBase/care/candidates/$visitorA"
$detailB = Json-Get "$ApiBase/care/candidates/$visitorB"

Assert ($null -eq $detailA.item.assignedTo) "visitor A detail should clear assignedTo"
Assert ($detailA.item.assignmentState -eq "unassigned") "visitor A assignmentState should be unassigned"
Assert ($detailA.item.assignmentBucket -eq "queue") "visitor A assignmentBucket should be queue"

Assert ($null -eq $detailB.item.assignedTo) "visitor B detail should clear assignedTo"
Assert ($detailB.item.assignmentState -eq "unassigned") "visitor B assignmentState should be unassigned"
Assert ($detailB.item.assignmentBucket -eq "queue") "visitor B assignmentBucket should be queue"

Write-Host "OK: care candidate bulk unassign command E2E contract passed."
