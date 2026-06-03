param(
  [string]$BaseUrl = "http://127.0.0.1:7071",
  [string]$ApiKey = $env:HOPE_API_KEY
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

$ApiBase = ($BaseUrl.TrimEnd("/") + "/api")
function Get-Headers {
  if ([string]::IsNullOrWhiteSpace($ApiKey)) {
    throw "HOPE_API_KEY required"
  }

  return @{ "x-api-key" = $ApiKey }
}

function Assert([bool]$Condition, [string]$Message) {
  if (-not $Condition) {
    throw "ASSERT FAILED: $Message"
  }
}

function Json-Get([string]$Url) {
  Invoke-RestMethod `
    -Method GET `
    -Uri $Url `
    -Headers (Get-Headers)
}

function Json-Post([string]$Url, [object]$Body) {
  Invoke-RestMethod `
    -Method POST `
    -Uri $Url `
    -Headers (Get-Headers) `
    -ContentType "application/json" `
    -Body ($Body | ConvertTo-Json -Depth 30)
}

function New-EventId([string]$Prefix) {
  "$Prefix-$([guid]::NewGuid().ToString('N'))"
}

function Get-ItemByVisitorId($Items, [string]$VisitorId) {
  @($Items) | Where-Object { [string]$_.visitorId -eq $VisitorId } | Select-Object -First 1
}

Write-Host "=== ASSERT: Ops followups projection consistency ==="
Write-Host "ApiBase=$ApiBase"

$visitor = Json-Post "$ApiBase/visitors" @{
  name = "Ops Followups Projection Consistency"
  email = "ops-followups-projection-consistency+$([guid]::NewGuid().ToString('N'))@example.org"
  source = "assert-ops-followups-projection-consistency.ps1"
}

$visitorId = [string]$visitor.visitorId
Assert (-not [string]::IsNullOrWhiteSpace($visitorId)) "visitorId should exist"

$base = (Get-Date).ToUniversalTime().AddMinutes(-5)
$ownerId = "ops-user-1"

Json-Post "$ApiBase/formation/events" @{
  v = 1
  eventId = New-EventId "evt-ops-followups-projection-assign"
  visitorId = $visitorId
  type = "FOLLOWUP_ASSIGNED"
  occurredAt = $base.ToString("o")
  source = @{ system = "assert-ops-followups-projection-consistency"; actorId = $ownerId }
  data = @{ assigneeId = $ownerId }
} | Out-Null

Start-Sleep -Milliseconds 150

$summaryAssigned = Json-Get "$ApiBase/visitors/$([Uri]::EscapeDataString($visitorId))/summary"
$profileAssigned = Json-Get "$ApiBase/visitors/$([Uri]::EscapeDataString($visitorId))/formation/profile"
$opsAssigned = Json-Get "$ApiBase/ops/followups?visitorId=$([Uri]::EscapeDataString($visitorId))&includeResolved=false&limit=20"
$dashboardAssigned = Json-Get "$ApiBase/dashboard/followups?limit=500"

$opsAssignedItem = Get-ItemByVisitorId -Items $opsAssigned.items -VisitorId $visitorId
$dashboardAssignedItem = Get-ItemByVisitorId -Items $dashboardAssigned.items -VisitorId $visitorId

Assert ($null -ne $opsAssignedItem) "assigned visitor should appear in default ops followups"
Assert ($null -ne $dashboardAssignedItem) "assigned visitor should appear in dashboard followups"
Assert ([string]$profileAssigned.profile.assignedTo -eq $ownerId) "profile assignedTo should match owner"
Assert ([string]$opsAssignedItem.assignedTo.ownerId -eq $ownerId) "ops item assignedTo should match profile"
Assert ($summaryAssigned.summary.integration.needsFollowup -eq $true) "summary needsFollowup should be true after assignment"
Assert ($summaryAssigned.summary.integration.followupResolved -eq $false) "summary followupResolved should be false after assignment"
Assert ($opsAssignedItem.followupResolved -ne $true) "ops item should be unresolved after assignment"

Json-Post "$ApiBase/formation/events" @{
  v = 1
  eventId = New-EventId "evt-ops-followups-projection-contact"
  visitorId = $visitorId
  type = "FOLLOWUP_CONTACTED"
  occurredAt = $base.AddSeconds(1).ToString("o")
  source = @{ system = "assert-ops-followups-projection-consistency"; actorId = $ownerId }
  data = @{ method = "phone" }
} | Out-Null

Json-Post "$ApiBase/formation/events" @{
  v = 1
  eventId = New-EventId "evt-ops-followups-projection-outcome"
  visitorId = $visitorId
  type = "FOLLOWUP_OUTCOME_RECORDED"
  occurredAt = $base.AddSeconds(2).ToString("o")
  source = @{ system = "assert-ops-followups-projection-consistency"; actorId = $ownerId }
  data = @{ outcome = "connected" }
} | Out-Null

Start-Sleep -Milliseconds 500

$summaryResolved = Json-Get "$ApiBase/visitors/$([Uri]::EscapeDataString($visitorId))/summary"
$profileResolved = Json-Get "$ApiBase/visitors/$([Uri]::EscapeDataString($visitorId))/formation/profile"
$opsDefaultResolved = Json-Get "$ApiBase/ops/followups?visitorId=$([Uri]::EscapeDataString($visitorId))&includeResolved=false&limit=20"
$opsIncludedResolved = Json-Get "$ApiBase/ops/followups?visitorId=$([Uri]::EscapeDataString($visitorId))&includeResolved=true&limit=20"
$dashboardResolved = Json-Get "$ApiBase/dashboard/followups?limit=500"

$opsDefaultResolvedItem = Get-ItemByVisitorId -Items $opsDefaultResolved.items -VisitorId $visitorId
$opsIncludedResolvedItem = Get-ItemByVisitorId -Items $opsIncludedResolved.items -VisitorId $visitorId
$dashboardResolvedItem = Get-ItemByVisitorId -Items $dashboardResolved.items -VisitorId $visitorId

Assert ([string]$profileResolved.profile.assignedTo -eq $ownerId) "resolved profile assignedTo should preserve owner"
Assert ([string]$profileResolved.profile.lastFollowupOutcome -eq "connected") "profile lastFollowupOutcome should be connected"
Assert ($summaryResolved.summary.integration.followupResolved -eq $true) "summary followupResolved should be true after connected outcome"
Assert ($summaryResolved.summary.integration.needsFollowup -eq $false) "summary needsFollowup should be false after connected outcome"
Assert ($null -eq $opsDefaultResolvedItem) "resolved visitor should be excluded from default ops followups"
Assert ($null -eq $dashboardResolvedItem) "resolved visitor should be excluded from dashboard followups"
Assert ($null -ne $opsIncludedResolvedItem) "resolved visitor should appear with includeResolved=true"
Assert ($opsIncludedResolvedItem.followupResolved -eq $true) "includeResolved ops item should be marked resolved"
Assert ([string]$opsIncludedResolvedItem.assignedTo.ownerId -eq $ownerId) "includeResolved ops owner should match profile owner"

Write-Host "OK: ops followups projection consistency assertion passed." -ForegroundColor Green