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
    eventId = New-EventId "evt-formation-profile-integrity"
    visitorId = $VisitorId
    type = $Type
    occurredAt = New-IsoUtc $OccurredAt
    source = @{
      system = "assert-formation-profile-projection-integrity-contract"
      actorId = "ops-user-1"
    }
    data = $Data
  } | Out-Null
}

function Insert-OrphanFormationProfile([string]$VisitorId, [string]$OccurredAt) {
  $js = @"
(async () => {
  const visitorId = process.argv[1];
  const occurredAt = process.argv[2];
  const conn = process.env.STORAGE_CONNECTION_STRING;
  const tableName = process.env.FORMATION_PROFILES_TABLE || "devFormationProfiles";

  if (!conn) throw new Error("STORAGE_CONNECTION_STRING is not set");

  const { TableClient } = require("@azure/data-tables");
  const table = TableClient.fromConnectionString(conn, tableName);

  await table.upsertEntity({
    partitionKey: "VISITOR",
    rowKey: visitorId,
    visitorId,
    stage: "Connected",
    stageReason: "orphan-profile-integrity-test",
    stageUpdatedAt: occurredAt,
    assignedTo: "ops-formation-orphan",
    lastEventType: "FOLLOWUP_ASSIGNED",
    lastEventAt: occurredAt,
    lastFollowupAssignedAt: occurredAt,
    updatedAt: occurredAt
  }, "Replace");

  console.log("OK: Inserted orphan formation profile:", visitorId);
})().catch(err => { console.error(err && err.stack || err); process.exit(1); });
"@

  node -e $js "$VisitorId" "$OccurredAt" | Out-Host
}

function Find-ProfileByVisitorId($Items, [string]$VisitorId) {
  @($Items) | Where-Object { [string]$_.visitorId -eq $VisitorId } | Select-Object -First 1
}

function Get-FormationProfilesPage([string]$Query) {
  $response = Json-Get "$ApiBase/formation/profiles?$Query"
  Assert ($response.ok -eq $true) "formation profiles response should be ok"
  Assert ($null -ne $response.projectionIntegrity) "formation profiles should expose projectionIntegrity"
  Assert ($null -ne $response.projectionIntegrity.PSObject.Properties["orphanProfilesExcluded"]) "formation profiles should expose orphanProfilesExcluded"
  return $response
}

Write-Host "Running formation profile projection integrity regression..."
Write-Host "ApiBase=$ApiBase"

$visitor = Json-Post "$ApiBase/visitors" @{
  name = "Formation Profile Integrity $([guid]::NewGuid().ToString('N').Substring(0,8))"
  email = "formation-profile-integrity+$([guid]::NewGuid().ToString('N'))@example.com"
  source = "assert-formation-profile-projection-integrity-contract.ps1"
}

$visitorId = [string]$visitor.visitorId
Assert (-not [string]::IsNullOrWhiteSpace($visitorId)) "visitorId should be returned"

$base = (Get-Date).ToUniversalTime().AddMinutes(-5)

Post-FormationEvent -VisitorId $visitorId -Type "FOLLOWUP_ASSIGNED" -OccurredAt $base -Data @{
  assigneeId = "ops-formation-integrity"
}

Post-FormationEvent -VisitorId $visitorId -Type "FOLLOWUP_CONTACTED" -OccurredAt $base.AddSeconds(1) -Data @{
  method = "phone"
}

$orphanVisitorId = "orphan-formation-profile-" + [guid]::NewGuid().ToString("N")
$orphanAt = (Get-Date).ToUniversalTime().AddMinutes(-4).ToString("o")
Insert-OrphanFormationProfile -VisitorId $orphanVisitorId -OccurredAt $orphanAt

Start-Sleep -Milliseconds 750

$visitorFastPath = Get-FormationProfilesPage "visitorId=$(Enc $visitorId)&limit=10"
$fastPathProfile = Find-ProfileByVisitorId $visitorFastPath.items $visitorId
Assert ($null -ne $fastPathProfile) "valid visitor should appear through formation profile visitorId fast path"
Assert ([string]$fastPathProfile.assignedTo -eq "ops-formation-integrity") "fast path profile assignedTo should match canonical projection"

$detail = Json-Get "$ApiBase/visitors/$(Enc $visitorId)/formation/profile"
Assert ($detail.ok -eq $true) "formation profile detail response should be ok"
Assert ($null -ne $detail.profile) "valid visitor detail profile should exist"
Assert ([string]$detail.profile.visitorId -eq $visitorId) "detail profile visitorId should match"
Assert ([string]$detail.profile.assignedTo -eq [string]$fastPathProfile.assignedTo) "detail assignedTo should match list fast path"

$orphanFastPath = Get-FormationProfilesPage "visitorId=$(Enc $orphanVisitorId)&limit=10"
Assert ((@($orphanFastPath.items)).Count -eq 1) "visitorId fast path should expose stored profile shape for direct profile lookup"
Assert ([string]$orphanFastPath.items[0].visitorId -eq $orphanVisitorId) "orphan fast path should return requested profile row"

$list = Get-FormationProfilesPage "assignedTo=ops-formation-orphan&limit=200"
Assert ([int]$list.projectionIntegrity.orphanProfilesExcluded -ge 1) "formation profiles orphanProfilesExcluded should increment for orphan profile"
Assert ($null -eq (Find-ProfileByVisitorId $list.items $orphanVisitorId)) "orphan profile should be excluded from normal formation profile list"

$validAssignedList = Get-FormationProfilesPage "assignedTo=ops-formation-integrity&limit=200"
Assert ($null -ne (Find-ProfileByVisitorId $validAssignedList.items $visitorId)) "valid profile should appear in assigned formation profile list"

$orphanDetail = Json-Get "$ApiBase/visitors/$(Enc $orphanVisitorId)/formation/profile"
Assert ($orphanDetail.ok -eq $true) "orphan detail lookup response should be ok"
Assert ($null -ne $orphanDetail.profile) "detail endpoint should remain raw profile lookup for requested profile row"
Assert ([string]$orphanDetail.profile.visitorId -eq $orphanVisitorId) "orphan detail should return requested profile row"

Write-Host "OK: formation profile projection integrity regression passed."
