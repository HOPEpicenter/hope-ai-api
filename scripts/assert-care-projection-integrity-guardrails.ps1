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
$headers = @{
  "x-api-key" = $ApiKey
  "content-type" = "application/json"
}

function Assert($Condition, [string]$Message) {
  if (-not $Condition) {
    throw "ASSERT FAILED: $Message"
  }
}

function Json-Get([string]$Url) {
  Invoke-RestMethod -Method Get -Uri $Url -Headers $headers
}

function Json-Post([string]$Url, [object]$Body) {
  Invoke-RestMethod -Method Post -Uri $Url -Headers $headers -ContentType "application/json" -Body ($Body | ConvertTo-Json -Depth 30)
}

function Enc([string]$Value) {
  [Uri]::EscapeDataString($Value)
}

function New-EventId([string]$Prefix) {
  "$Prefix-$([guid]::NewGuid().ToString('N'))"
}

function New-IsoUtc([datetime]$Value) {
  $Value.ToUniversalTime().ToString("o")
}

function Post-FormationEvent([string]$VisitorId, [string]$Type, [datetime]$OccurredAt, [hashtable]$Data) {
  Json-Post "$ApiBase/formation/events" @{
    v = 1
    eventId = New-EventId "evt-care-projection-integrity"
    visitorId = $VisitorId
    type = $Type
    occurredAt = New-IsoUtc $OccurredAt
    source = @{
      system = "assert-care-projection-integrity-guardrails"
      actorId = "ops-user-1"
    }
    data = $Data
  } | Out-Null
}

function New-CareCandidate([string]$OwnerId) {
  $visitor = Json-Post "$ApiBase/visitors" @{
    name = "Care Projection Integrity $([guid]::NewGuid().ToString('N').Substring(0,8))"
    email = "care-projection-integrity+$([guid]::NewGuid().ToString('N'))@example.com"
    source = "assert-care-projection-integrity-guardrails.ps1"
  }

  $visitorId = [string]$visitor.visitorId
  Assert (-not [string]::IsNullOrWhiteSpace($visitorId)) "visitorId should be returned"

  $base = (Get-Date).ToUniversalTime().AddMinutes(-5)

  Post-FormationEvent -VisitorId $visitorId -Type "FOLLOWUP_ASSIGNED" -OccurredAt $base -Data @{
    assigneeId = $OwnerId
  }

  Post-FormationEvent -VisitorId $visitorId -Type "FOLLOWUP_CONTACTED" -OccurredAt $base.AddSeconds(1) -Data @{
    method = "phone"
  }

  Post-FormationEvent -VisitorId $visitorId -Type "FOLLOWUP_OUTCOME_RECORDED" -OccurredAt $base.AddSeconds(2) -Data @{
    outcome = "needs_care"
  }

  return $visitorId
}

function Insert-OrphanCareProfile([string]$VisitorId, [string]$AssignedTo, [string]$OccurredAt) {
  $jsInsertOrphanProfile = @"
(async () => {
  const visitorId = process.argv[1];
  const assignedTo = process.argv[2];
  const occurredAt = process.argv[3];
  const conn = process.env.STORAGE_CONNECTION_STRING;
  const tableName = process.env.FORMATION_PROFILES_TABLE || "devFormationProfiles";

  if (!conn) throw new Error("STORAGE_CONNECTION_STRING is not set");

  const { TableClient } = require("@azure/data-tables");
  const table = TableClient.fromConnectionString(conn, tableName);

  await table.upsertEntity({
    partitionKey: "VISITOR",
    rowKey: visitorId,
    visitorId,
    displayName: "Orphan Care Projection Integrity",
    stage: "Connected",
    stageUpdatedAt: occurredAt,
    assignedTo,
    lastFollowupAssignedAt: occurredAt,
    lastFollowupContactedAt: occurredAt,
    lastFollowupOutcomeAt: occurredAt,
    lastFollowupOutcome: "needs_care"
  }, "Replace");

  console.log("OK: Inserted orphan care profile:", visitorId);
})().catch(err => { console.error(err && err.stack || err); process.exit(1); });
"@

  node -e $jsInsertOrphanProfile "$VisitorId" "$AssignedTo" "$OccurredAt" | Out-Host
}

function Find-ItemByVisitorId($Items, [string]$VisitorId) {
  @($Items) | Where-Object { [string]$_.visitorId -eq $VisitorId } | Select-Object -First 1
}

function Get-CareListItems([string]$AssignmentState, [string]$AssignmentBucket) {
  $items = @()
  $cursor = $null
  $maxOrphanProfilesExcluded = 0

  do {
    $url = "$ApiBase/care/candidates?assignmentState=$AssignmentState&assignmentBucket=$AssignmentBucket&limit=500"
    if (-not [string]::IsNullOrWhiteSpace([string]$cursor)) {
      $url = "$url&cursor=$(Enc ([string]$cursor))"
    }

    $page = Json-Get $url
    Assert ($page.ok -eq $true) "care candidates response should be ok"
    Assert ($null -ne $page.projectionIntegrity) "care candidates should expose projectionIntegrity"
    Assert ($null -ne $page.projectionIntegrity.PSObject.Properties["orphanProfilesExcluded"]) "care candidates should expose orphanProfilesExcluded"

    $pageOrphans = [int]$page.projectionIntegrity.orphanProfilesExcluded
    if ($pageOrphans -gt $maxOrphanProfilesExcluded) {
      $maxOrphanProfilesExcluded = $pageOrphans
    }

    $items += @($page.items)
    $cursor = $page.nextCursor
  } while (-not [string]::IsNullOrWhiteSpace([string]$cursor))

  return @{
    items = $items
    projectionIntegrity = [pscustomobject]@{
      orphanProfilesExcluded = $maxOrphanProfilesExcluded
    }
  }
}

function Get-CareExportItems([string]$AssignmentState, [string]$AssignmentBucket) {
  $export = Json-Get "$ApiBase/care/export?assignmentState=$AssignmentState&assignmentBucket=$AssignmentBucket"
  Assert ($export.ok -eq $true) "care export response should be ok"
  Assert ($null -ne $export.projectionIntegrity) "care export should expose projectionIntegrity"
  Assert ($null -ne $export.projectionIntegrity.PSObject.Properties["orphanProfilesExcluded"]) "care export should expose orphanProfilesExcluded"

  return @{
    items = @($export.items)
    projectionIntegrity = $export.projectionIntegrity
  }
}

function Get-CareSummary([string]$AssignmentState, [string]$AssignmentBucket) {
  $summaryResponse = Json-Get "$ApiBase/care/summary?assignmentState=$AssignmentState&assignmentBucket=$AssignmentBucket"
  Assert ($summaryResponse.ok -eq $true) "care summary response should be ok"
  Assert ($null -ne $summaryResponse.projectionIntegrity) "care summary should expose projectionIntegrity"
  Assert ($null -ne $summaryResponse.projectionIntegrity.PSObject.Properties["orphanProfilesExcluded"]) "care summary should expose orphanProfilesExcluded"

  $summary = if ($null -ne $summaryResponse.summary) { $summaryResponse.summary } else { $summaryResponse }

  return @{
    summary = $summary
    projectionIntegrity = $summaryResponse.projectionIntegrity
  }
}

function Assert-ProjectionIntegrity($Envelope, [string]$Surface) {
  Assert ($null -ne $Envelope) "$Surface projectionIntegrity should exist"
  Assert ($null -ne $Envelope.PSObject.Properties["orphanProfilesExcluded"]) "$Surface orphanProfilesExcluded should exist"
  Assert ([int]$Envelope.orphanProfilesExcluded -ge 1) "$Surface orphanProfilesExcluded should increment for orphan profile"
}

Write-Host "Running care projection integrity guardrails regression..."
Write-Host "ApiBase=$ApiBase"

$validVisitorId = New-CareCandidate "ops-care-integrity-owner"
$orphanVisitorId = "orphan-care-projection-" + [guid]::NewGuid().ToString("N")
$orphanAt = (Get-Date).ToUniversalTime().AddMinutes(-4).ToString("o")

Insert-OrphanCareProfile -VisitorId $orphanVisitorId -AssignedTo "ops-care-integrity-orphan" -OccurredAt $orphanAt

Start-Sleep -Milliseconds 750

$list = Get-CareListItems "assigned" "owned"
$export = Get-CareExportItems "assigned" "owned"
$summary = Get-CareSummary "assigned" "owned"

Assert-ProjectionIntegrity $list.projectionIntegrity "care candidates"
Assert-ProjectionIntegrity $export.projectionIntegrity "care export"
Assert-ProjectionIntegrity $summary.projectionIntegrity "care summary"

Assert ($null -ne (Find-ItemByVisitorId $list.items $validVisitorId)) "valid care candidate should appear in care candidates"
Assert ($null -ne (Find-ItemByVisitorId $export.items $validVisitorId)) "valid care candidate should appear in care export"

Assert ($null -eq (Find-ItemByVisitorId $list.items $orphanVisitorId)) "orphan profile should not appear in care candidates"
Assert ($null -eq (Find-ItemByVisitorId $export.items $orphanVisitorId)) "orphan profile should not appear in care export"

Assert ([int]$summary.summary.filteredCount -eq @($list.items).Count) "summary filteredCount should equal care candidates count after orphan exclusion"
Assert ([int]$summary.summary.filteredCount -eq @($export.items).Count) "summary filteredCount should equal care export count after orphan exclusion"

Write-Host "OK: care projection integrity guardrails regression passed."


