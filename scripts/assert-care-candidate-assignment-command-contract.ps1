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
    eventId = New-EventId "evt-care-assignment-command"
    visitorId = $VisitorId
    type = $Type
    occurredAt = New-IsoUtc $OccurredAt
    source = @{
      system = "assert-care-candidate-assignment-command"
      actorId = "ops-user-1"
    }
    data = $Data
  } | Out-Null
}

Write-Host "Running care candidate assignment command E2E contract..."
Write-Host "ApiBase=$ApiBase"

$visitor = Json-Post "$ApiBase/visitors" @{
  name = "Care Assignment Command $([guid]::NewGuid().ToString('N').Substring(0,8))"
  email = "care-assignment-command+$([guid]::NewGuid().ToString('N'))@example.com"
  source = "assert-care-candidate-assignment-command-contract.ps1"
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

Start-Sleep -Milliseconds 500

$assigned = Json-Post "$ApiBase/care/candidates/$visitorId/assign" @{
  assignedTo = "ops-user-2"
}

Assert ($assigned.ok -eq $true) "assign response should be ok"
Assert ($assigned.found -eq $true) "assigned candidate should be found"
Assert ($assigned.item.assignedTo -eq "ops-user-2") "assignedTo should update"
Assert ($assigned.item.assignmentState -eq "assigned") "assignmentState should be assigned"
Assert ($assigned.item.assignmentBucket -eq "owned") "assignmentBucket should be owned"

$detailAfterAssign = Json-Get "$ApiBase/care/candidates/$visitorId"
Assert ($detailAfterAssign.item.assignedTo -eq "ops-user-2") "detail should reflect assignedTo"
Assert ($detailAfterAssign.item.assignmentState -eq "assigned") "detail assignmentState should be assigned"
Assert ($detailAfterAssign.item.assignmentBucket -eq "owned") "detail assignmentBucket should be owned"

$unassigned = Json-Post "$ApiBase/care/candidates/$visitorId/unassign" @{}

Assert ($unassigned.ok -eq $true) "unassign response should be ok"
Assert ($unassigned.found -eq $true) "unassigned candidate should be found"
Assert ($null -eq $unassigned.item.assignedTo) "assignedTo should clear"
Assert ($unassigned.item.assignmentState -eq "unassigned") "assignmentState should be unassigned"
Assert ($unassigned.item.assignmentBucket -eq "queue") "assignmentBucket should be queue"

$detailAfterUnassign = Json-Get "$ApiBase/care/candidates/$visitorId"
Assert ($null -eq $detailAfterUnassign.item.assignedTo) "detail assignedTo should clear"
Assert ($detailAfterUnassign.item.assignmentState -eq "unassigned") "detail assignmentState should be unassigned"
Assert ($detailAfterUnassign.item.assignmentBucket -eq "queue") "detail assignmentBucket should be queue"

Write-Host "OK: care candidate assignment command E2E contract passed."
