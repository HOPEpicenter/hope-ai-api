param(
  [string]$ApiBase = "http://127.0.0.1:7071/api",
  [string]$ApiKey = $env:HOPE_API_KEY
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

if ([string]::IsNullOrWhiteSpace($ApiKey)) {
  throw "ApiKey is required."
}

$api = $ApiBase.Trim().TrimEnd("/")
$ops = "$api/ops"

$headers = @{
  "x-api-key" = $ApiKey
}

function Json-Get([string]$Url) {
  return Invoke-RestMethod `
    -Method Get `
    -Uri $Url `
    -Headers $headers
}

function Json-Post([string]$Url, [object]$Body) {
  return Invoke-RestMethod `
    -Method Post `
    -Uri $Url `
    -Headers $headers `
    -ContentType "application/json" `
    -Body ($Body | ConvertTo-Json -Depth 20)
}

function Assert {
  param(
    [bool]$Condition,
    [string]$Message
  )

  if (-not $Condition) {
    throw "ASSERT FAILED: $Message"
  }
}

Write-Host "=== ASSERT: OPS projection guardrails ==="
Write-Host "ApiBase=$api"

Write-Host "Checking malformed cursor fallback behavior..."

$cursorAlpha = Json-Get "$ops/followups?cursor=abc&limit=5"
Assert ($cursorAlpha.ok -eq $true) "alpha cursor should not fail"

$cursorNegative = Json-Get "$ops/followups?cursor=-1&limit=5"
Assert ($cursorNegative.ok -eq $true) "negative cursor should not fail"

$cursorHuge = Json-Get "$ops/followups?cursor=999999&limit=5"
Assert ($cursorHuge.ok -eq $true) "huge cursor should not fail"

Assert (($cursorHuge.items | Measure-Object).Count -eq 0) "huge cursor should return empty item set"

Write-Host "Checking orphan followup projection exclusion..."

$orphanVisitorId = "orphan-projection-" + [Guid]::NewGuid().ToString("N")
$orphanAssignedAt = (Get-Date).ToUniversalTime().AddMinutes(-5).ToString("o")

$jsInsertOrphanProfile = @"
(async () => {
  const visitorId = process.argv[1];
  const assignedAt = process.argv[2];
  const conn = process.env.STORAGE_CONNECTION_STRING;
  const tableName = process.env.FORMATION_PROFILES_TABLE || "devFormationProfiles";

  if (!conn) throw new Error("STORAGE_CONNECTION_STRING is not set");

  const { TableClient } = require("@azure/data-tables");
  const table = TableClient.fromConnectionString(conn, tableName);

  await table.upsertEntity({
    partitionKey: "VISITOR",
    rowKey: visitorId,
    visitorId,
    stage: "Guest",
    stageUpdatedAt: assignedAt,
    assignedTo: "ops-orphan-guardrails",
    lastFollowupAssignedAt: assignedAt
  }, "Replace");

  console.log("OK: Inserted orphan formation profile:", visitorId);
})().catch(err => { console.error(err && err.stack || err); process.exit(1); });
"@

node -e $jsInsertOrphanProfile "$orphanVisitorId" "$orphanAssignedAt" | Out-Host

$orphanFollowups = Json-Get "$api/dashboard/followups?limit=100"

Assert ($orphanFollowups.ok -eq $true) "orphan followups request should succeed"

$orphanItems = @($orphanFollowups.items | Where-Object { $_.visitorId -eq $orphanVisitorId })
Assert ($orphanItems.Count -eq 0) "orphan profile should not appear in followups queue"

Assert ($null -ne $orphanFollowups.projectionIntegrity) "followups should expose projectionIntegrity"
Assert ($null -ne $orphanFollowups.projectionIntegrity.PSObject.Properties["orphanFollowupsExcluded"]) "projectionIntegrity should expose orphanFollowupsExcluded"
Assert ([int]$orphanFollowups.projectionIntegrity.orphanFollowupsExcluded -ge 1) "orphanFollowupsExcluded should increment for orphan profile"

Write-Host "Checking projection lag + repair diagnostics..."

$visitor = Json-Post "$api/visitors" @{
  name = "Projection Guardrails"
  email = "projection-guardrails@example.org"
}

$visitorId = [string]$visitor.visitorId

Assert ($visitorId.Length -gt 0) "visitorId should exist"

$occurredAt = (Get-Date).ToUniversalTime().ToString("o")

Json-Post "$api/formation/events" @{
  v = 1
  eventId = "evt-projection-guardrails-$([guid]::NewGuid().ToString('N'))"
  visitorId = $visitorId
  type = "FOLLOWUP_ASSIGNED"
  occurredAt = $occurredAt
  source = @{
    system = "scripts/assert-ops-projection-guardrails.ps1"
  }
  data = @{
    assigneeId = "ops-projection-guardrails"
  }
} | Out-Null

$audit1 = Json-Post "$api/_ops/formation/profile-audit" @{
  visitorId = $visitorId
  repair = $false
}

Assert ($audit1.ok -eq $true) "repair=false audit should succeed"
Assert ($null -ne $audit1.PSObject.Properties["profileBehind"]) "audit should expose profileBehind"
Assert ($null -ne $audit1.PSObject.Properties["lagMs"]) "audit should expose lagMs"
Assert ($null -ne $audit1.PSObject.Properties["latestEventAt"]) "audit should expose latestEventAt"

$audit2 = Json-Post "$api/_ops/formation/profile-audit" @{
  visitorId = $visitorId
  repair = $true
}

Assert ($audit2.ok -eq $true) "repair=true audit should succeed"
Assert ($audit2.repair -eq $true) "repair=true should echo true"

$audit3 = Json-Post "$api/_ops/formation/profile-audit" @{
  visitorId = $visitorId
  repair = $true
}

Assert ($audit3.ok -eq $true) "second repair=true audit should succeed"

Write-Host "OK: OPS projection guardrails assertion passed."

