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
  Write-Host "[debug] POST $Url"
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
    name = "Care Candidate E2E $Label $([guid]::NewGuid().ToString('N').Substring(0,8))"
    email = "care-candidate-e2e-$($Label.ToLower().Replace('_','-'))+$([guid]::NewGuid().ToString('N'))@example.com"
    source = "assert-care-candidates-end-to-end.ps1"
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
    eventId = New-EventId "evt-care-candidates-e2e"
    visitorId = $VisitorId
    type = $Type
    occurredAt = New-IsoUtc $OccurredAt
    source = @{
      system = "assert-care-candidates-end-to-end"
      actorId = "ops-user-1"
    }
    data = $Data
  } | Out-Null
}

function Seed-FollowupOutcome([string]$Outcome) {
  $visitorId = Create-TestVisitor $Outcome
  $base = (Get-Date).ToUniversalTime().AddMinutes(-5)

  Post-FormationEvent -VisitorId $visitorId -Type "FOLLOWUP_ASSIGNED" -OccurredAt $base -Data @{
    assigneeId = "ops-user-1"
  }

  Start-Sleep -Milliseconds 50

  Post-FormationEvent -VisitorId $visitorId -Type "FOLLOWUP_CONTACTED" -OccurredAt $base.AddSeconds(1) -Data @{
    method = "phone"
  }

  Start-Sleep -Milliseconds 50

  Post-FormationEvent -VisitorId $visitorId -Type "FOLLOWUP_OUTCOME_RECORDED" -OccurredAt $base.AddSeconds(2) -Data @{
    outcome = $Outcome
  }

  return $visitorId
}

function Find-Candidate($Items, [string]$VisitorId) {
  @($Items) | Where-Object { [string]$_.visitorId -eq $VisitorId } | Select-Object -First 1
}

Write-Host "Running care candidates end-to-end assertion..."
Write-Host "ApiBase=$ApiBase"

$needsCareVisitorId = Seed-FollowupOutcome "needs_care"
$connectedVisitorId = Seed-FollowupOutcome "connected"
$closedVisitorId = Seed-FollowupOutcome "closed"

Start-Sleep -Milliseconds 750

$response = Json-Get "$ApiBase/care/candidates?limit=500"

Assert ($response.ok -eq $true) "care candidates response should be ok"

$needsCareItem = Find-Candidate -Items $response.items -VisitorId $needsCareVisitorId
$connectedItem = Find-Candidate -Items $response.items -VisitorId $connectedVisitorId
$closedItem = Find-Candidate -Items $response.items -VisitorId $closedVisitorId

Assert ($null -ne $needsCareItem) "needs_care visitor should appear in care candidates"
Assert ($needsCareItem.reason -eq "needs_care") "needs_care candidate reason should match"
Assert ($needsCareItem.source.workflowId -eq "care") "needs_care candidate workflowId should be care"
Assert ($needsCareItem.source.followupOutcome -eq "needs_care") "needs_care candidate source outcome should match"
Assert ($needsCareItem.carePriority -eq "normal") "carePriority should be normal"
Assert ($needsCareItem.careAgeBucket -eq "new") "careAgeBucket should be new"
Assert ($needsCareItem.escalationLevel -eq "none") "escalationLevel should be none"
Assert ($needsCareItem.recommendedCareAction -eq "review_followup") "recommendedCareAction should match"

Assert ($null -eq $connectedItem) "connected visitor should not appear in care candidates"
Assert ($null -eq $closedItem) "closed visitor should not appear in care candidates"

Write-Host "OK: care candidates end-to-end assertion passed."

