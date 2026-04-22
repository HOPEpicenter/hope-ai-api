# scripts/assert-ops-followups.ps1
# Regression: OPS followups projection stays healthy + reflects formation followup lifecycle,
# engagement-risk enrichment, and deterministic ordering invariants.
# PowerShell 7+.

[CmdletBinding()]
param(
  # Preferred: single root base (script derives /api + /ops)
  [Parameter(Mandatory=$false)]
  [string]$BaseUrl,

  # Back-compat: explicit bases
  [Parameter(Mandatory=$false)]
  [string]$ApiBase,

  [Parameter(Mandatory=$false)]
  [string]$OpsBase,

  # Auth (required for /ops + protected /api)
  [Parameter(Mandatory=$false)]
  [string]$ApiKey
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"
$ProgressPreference = "SilentlyContinue"

function Normalize-Base([string]$u) {
  if ([string]::IsNullOrWhiteSpace($u)) { return "" }
  return $u.Trim().TrimEnd("/")
}

function Require-ApiKey([string]$k) {
  if ([string]::IsNullOrWhiteSpace($k)) {
    throw "HOPE_API_KEY is required (set env:HOPE_API_KEY or pass -ApiKey)."
  }
  return $k
}

function Assert-True([bool]$Condition, [string]$Message) {
  if (-not $Condition) {
    throw $Message
  }
}

function Assert-Equal($Actual, $Expected, [string]$Message) {
  if ($Actual -ne $Expected) {
    throw ("{0} Expected={1} Actual={2}" -f $Message, $Expected, $Actual)
  }
}

# Resolve bases
$BaseUrl = Normalize-Base $BaseUrl
$ApiBase = Normalize-Base $ApiBase
$OpsBase = Normalize-Base $OpsBase

if (-not $BaseUrl) {
  if (-not $ApiBase -or -not $OpsBase) {
    throw "Provide -BaseUrl OR both -ApiBase and -OpsBase."
  }
} else {
  if (-not $ApiBase) { $ApiBase = "$BaseUrl/api" }
  if (-not $OpsBase) { $OpsBase = "$BaseUrl/ops" }
}

# Resolve api key
if ([string]::IsNullOrWhiteSpace($ApiKey)) {
  $ApiKey = (Get-Item ("env:" + "HOPE_API_KEY") -ErrorAction SilentlyContinue).Value
}
$ApiKey = Require-ApiKey $ApiKey

$headers = @{ "x-api-key" = $ApiKey }

Write-Host ("[assert-ops-followups] ApiBase={0} OpsBase={1}" -f $ApiBase, $OpsBase)

function GetJson([string]$url) {
  return Invoke-RestMethod -Method Get -Uri $url -Headers $headers
}

function PostJson([string]$url, [object]$body) {
  return Invoke-RestMethod -Method Post -Uri $url -Headers $headers -ContentType "application/json" -Body ($body | ConvertTo-Json -Depth 20)
}

function GetFollowups() {
  $fu = GetJson "$OpsBase/followups"
  if ($null -eq $fu.ok) { throw "Expected /ops/followups to return an 'ok' field." }
  if (-not $fu.ok) { throw ("Expected ok=true; got ok={0} error={1}" -f $fu.ok, $fu.error) }
  if ($null -eq $fu.items) { throw "Expected /ops/followups to return 'items' array." }
  return $fu
}

function GetFollowupItem([object[]]$Items, [string]$VisitorId) {
  return @($Items) | Where-Object { $_.visitorId -eq $VisitorId } | Select-Object -First 1
}

function GetFollowupItemIndex([object[]]$Items, [string]$VisitorId) {
  for ($i = 0; $i -lt @($Items).Count; $i++) {
    if (@($Items)[$i].visitorId -eq $VisitorId) {
      return $i
    }
  }
  return -1
}

function Assert-VisitorSortsBefore([object[]]$Items, [string]$FirstVisitorId, [string]$SecondVisitorId, [string]$Message) {
  $firstIndex = GetFollowupItemIndex -Items $Items -VisitorId $FirstVisitorId
  $secondIndex = GetFollowupItemIndex -Items $Items -VisitorId $SecondVisitorId

  Assert-True ($firstIndex -ge 0) ("Expected visitorId={0} to be present. {1}" -f $FirstVisitorId, $Message)
  Assert-True ($secondIndex -ge 0) ("Expected visitorId={0} to be present. {1}" -f $SecondVisitorId, $Message)
  Assert-True ($firstIndex -lt $secondIndex) $Message
}

function New-Visitor([string]$FirstName, [string]$LastName, [string]$Prefix) {
  $email = "{0}+{1}@example.com" -f $Prefix, (Get-Date -Format "yyyyMMddHHmmssfff")
  $visitor = PostJson "$ApiBase/visitors" @{
    firstName = $FirstName
    lastName  = $LastName
    email     = $email
  }

  $visitorId = $visitor.visitorId
  if ([string]::IsNullOrWhiteSpace($visitorId)) { $visitorId = $visitor.id }
  if ([string]::IsNullOrWhiteSpace($visitorId)) {
    throw "Visitor id missing (expected visitorId or id)."
  }

  Write-Host ("[assert-ops-followups] visitorId={0} ({1})" -f $visitorId, $Prefix)
  return $visitorId
}

function Add-FormationEvent([string]$VisitorId, [string]$Type, [string]$OccurredAt, [hashtable]$Metadata) {
  $null = PostJson "$ApiBase/formation/events" @{
    id         = [Guid]::NewGuid().ToString()
    visitorId  = $VisitorId
    type       = $Type
    occurredAt = $OccurredAt
    metadata   = $Metadata
  }
}

function Add-EngagementEvent([string]$VisitorId, [string]$Type, [string]$OccurredAt, [hashtable]$Data) {
  $null = PostJson "$ApiBase/engagements/events" @{
    v          = 1
    eventId    = ("evt-" + ([Guid]::NewGuid().ToString("N")))
    visitorId  = $VisitorId
    type       = $Type
    occurredAt = $OccurredAt
    source     = @{ system = "scripts/assert-ops-followups.ps1" }
    data       = $Data
  }
}

function Assert-HighRiskUrgentItem($Item, [string]$VisitorId) {
  if (-not $Item) { throw "Expected visitorId=$VisitorId to exist in /ops/followups." }
  Assert-Equal $Item.engagementRiskLevel "high" "Expected engagementRiskLevel=high."
  Assert-True ($null -ne $Item.engagementRiskScore) "Expected engagementRiskScore to be present."
  Assert-True ([int]$Item.engagementRiskScore -ge 60) "Expected engagementRiskScore >= 60 for high-risk followup item."
  Assert-Equal $Item.priorityBand "urgent" "Expected priorityBand=urgent."
  Assert-Equal $Item.priorityReason "high_risk_needs_followup" "Expected priorityReason=high_risk_needs_followup."
}

function Assert-LowRiskNormalPriorityItem($Item, [string]$VisitorId) {
  if (-not $Item) { throw "Expected visitorId=$VisitorId to exist in /ops/followups." }

  Assert-Equal $Item.visitorId $VisitorId "Expected low-risk item visitorId to match."
  Assert-Equal $Item.engagementRiskLevel "low" "Expected engagementRiskLevel=low."
  Assert-True ($null -ne $Item.engagementRiskScore) "Expected engagementRiskScore to be present."
  Assert-True ([int]$Item.engagementRiskScore -lt 30) "Expected engagementRiskScore < 30 for low-risk followup item."

  Assert-Equal $Item.priorityBand "normal" "Expected priorityBand=normal for low-risk item that still needs followup."

  Assert-True (-not [string]::IsNullOrWhiteSpace([string]$Item.lastActivityAt)) "Expected lastActivityAt to be present."
  Assert-Equal $Item.lastFormationEventType $Item.followupReason "Expected lastFormationEventType to reflect current followup reason."
  Assert-True (-not [string]::IsNullOrWhiteSpace([string]$Item.lastFormationEventAt)) "Expected lastFormationEventAt to be present."

  if ($Item.stage -eq "Guest") {
    if ($Item.followupReason -eq "FOLLOWUP_CONTACTED") {
      Assert-Equal $Item.priorityReason "guest_contacted_needs_followup" "Expected priorityReason=guest_contacted_needs_followup for Guest low-risk contacted item that still needs followup."
      Assert-Equal $Item.followupUrgency "AT_RISK" "Expected followupUrgency=AT_RISK for Guest contacted item that still needs followup."
      Assert-True ($Item.followupUrgency -ne "ON_TRACK") "Expected Guest contacted item to never remain ON_TRACK."

      if ($Item.followupAgingBucket -eq "ONE_DAY") {
        Assert-Equal $Item.followupEscalated $true "Expected followupEscalated=true for Guest contacted one-day-old item."
        Assert-Equal $Item.followupOverdue $false "Expected followupOverdue=false for Guest contacted one-day-old item."
        Assert-Equal $Item.followupUrgency "AT_RISK" "Expected escalated Guest contacted one-day-old item to remain AT_RISK."
      }
    } else {
      Assert-Equal $Item.priorityReason "guest_needs_followup" "Expected priorityReason=guest_needs_followup for Guest low-risk item that still needs followup."
    }
  } else {
    Assert-Equal $Item.priorityReason "needs_followup" "Expected priorityReason=needs_followup for low-risk item that still needs followup."
  }
}

# 1) Fresh /ops/followups must be healthy/authenticated
Write-Host "[assert-ops-followups] GET /ops/followups (fresh) ..."
$null = GetFollowups

# 2) Create a primary visitor that should remain high-risk / urgent until outcome is recorded
Write-Host "[assert-ops-followups] POST /api/visitors (primary high-risk visitor) ..."
$primaryVisitorId = New-Visitor -FirstName "Ops" -LastName "Followups" -Prefix "ops-followups"

# 3) Record FOLLOWUP_ASSIGNED then ensure it appears in /ops/followups unresolved with risk enrichment
Write-Host "[assert-ops-followups] POST /api/formation/events FOLLOWUP_ASSIGNED ..."
$now = (Get-Date).ToUniversalTime()
$assignedAt = $now.ToString("o")
Add-FormationEvent -VisitorId $primaryVisitorId -Type "FOLLOWUP_ASSIGNED" -OccurredAt $assignedAt -Metadata @{ assigneeId = "ops-user-1" }

Start-Sleep -Milliseconds 250

Write-Host "[assert-ops-followups] GET /ops/followups (after assignment) ..."
$fuA = GetFollowups
$itemA = GetFollowupItem -Items $fuA.items -VisitorId $primaryVisitorId
if (-not $itemA) { throw "Expected visitorId=$primaryVisitorId to appear in followups queue after FOLLOWUP_ASSIGNED." }
if ($itemA.resolvedForAssignment -eq $true) { throw "Expected resolvedForAssignment=false after assignment." }
if (-not $itemA.assignedTo -or $itemA.assignedTo.ownerId -ne "ops-user-1") {
  throw ("Expected assignedTo.ownerId=ops-user-1. Got: {0}" -f ($itemA.assignedTo | ConvertTo-Json -Depth 6))
}
Assert-HighRiskUrgentItem -Item $itemA -VisitorId $primaryVisitorId

# 4) Record FOLLOWUP_UNASSIGNED then ensure it remains in /ops/followups with no assignee
Write-Host "[assert-ops-followups] POST /api/formation/events FOLLOWUP_UNASSIGNED ..."
$unassignAt = $now.AddSeconds(1).ToString("o")
Add-FormationEvent -VisitorId $primaryVisitorId -Type "FOLLOWUP_UNASSIGNED" -OccurredAt $unassignAt -Metadata @{}

Start-Sleep -Milliseconds 250

Write-Host "[assert-ops-followups] GET /ops/followups (after unassign) ..."
$fuU = GetFollowups
$itemU = GetFollowupItem -Items $fuU.items -VisitorId $primaryVisitorId
if (-not $itemU) { throw "Expected visitorId=$primaryVisitorId to remain in followups queue after FOLLOWUP_UNASSIGNED." }
if ($itemU.resolvedForAssignment -eq $true) { throw "Expected resolvedForAssignment=false after unassign." }
if ($itemU.assignedTo) {
  throw ("Expected assignedTo to be cleared after unassign. Got: {0}" -f ($itemU.assignedTo | ConvertTo-Json -Depth 6))
}
Assert-HighRiskUrgentItem -Item $itemU -VisitorId $primaryVisitorId

# 5) Record FOLLOWUP_ASSIGNED again then ensure it is reassigned
Write-Host "[assert-ops-followups] POST /api/formation/events FOLLOWUP_ASSIGNED (reassign) ..."
$reassignAt = $now.AddSeconds(2).ToString("o")
Add-FormationEvent -VisitorId $primaryVisitorId -Type "FOLLOWUP_ASSIGNED" -OccurredAt $reassignAt -Metadata @{ assigneeId = "ops-user-1" }

Start-Sleep -Milliseconds 250

Write-Host "[assert-ops-followups] GET /ops/followups (after reassign) ..."
$fuR = GetFollowups
$itemR = GetFollowupItem -Items $fuR.items -VisitorId $primaryVisitorId
if (-not $itemR) { throw "Expected visitorId=$primaryVisitorId to remain in followups queue after reassignment." }
if ($itemR.resolvedForAssignment -eq $true) { throw "Expected resolvedForAssignment=false after reassignment." }
if (-not $itemR.assignedTo -or $itemR.assignedTo.ownerId -ne "ops-user-1") {
  throw ("Expected assignedTo.ownerId=ops-user-1 after reassignment. Got: {0}" -f ($itemR.assignedTo | ConvertTo-Json -Depth 6))
}
Assert-HighRiskUrgentItem -Item $itemR -VisitorId $primaryVisitorId

# 6) Record FOLLOWUP_CONTACTED then ensure it remains in /ops/followups and enrichment still reflects risk
Write-Host "[assert-ops-followups] POST /api/formation/events FOLLOWUP_CONTACTED ..."
$contactAt = $now.AddSeconds(3).ToString("o")
Add-FormationEvent -VisitorId $primaryVisitorId -Type "FOLLOWUP_CONTACTED" -OccurredAt $contactAt -Metadata @{ method = "sms"; result = "reached" }

Start-Sleep -Milliseconds 250

Write-Host "[assert-ops-followups] GET /ops/followups (after contact) ..."
$fuC = GetFollowups
$itemC = GetFollowupItem -Items $fuC.items -VisitorId $primaryVisitorId
if (-not $itemC) { throw "Expected visitorId=$primaryVisitorId to remain in followups queue after FOLLOWUP_CONTACTED." }
if ($itemC.resolvedForAssignment -eq $true) { throw "Expected resolvedForAssignment=false after contact." }
if (-not $itemC.assignedTo -or $itemC.assignedTo.ownerId -ne "ops-user-1") {
  throw ("Expected assignedTo.ownerId=ops-user-1 after contact. Got: {0}" -f ($itemC.assignedTo | ConvertTo-Json -Depth 6))
}
Assert-HighRiskUrgentItem -Item $itemC -VisitorId $primaryVisitorId

# 7) Risk tie-break: same assigned timestamp, same assignee, same escalation state, different risk
Write-Host "[assert-ops-followups] POST /api/visitors (secondary low-risk visitor) ..."
$secondaryVisitorId = New-Visitor -FirstName "Ops" -LastName "FollowupsLow" -Prefix "ops-followups-low"

Write-Host "[assert-ops-followups] POST /api/engagements/events (secondary visitor recent signals) ..."
$recentNoteAt = $now.AddMinutes(-5).ToString("o")
$recentStatusAt = $now.AddMinutes(-2).ToString("o")
Add-EngagementEvent -VisitorId $secondaryVisitorId -Type "note.add" -OccurredAt $recentNoteAt -Data @{ text = "recent pastoral note"; visibility = "team" }
Add-EngagementEvent -VisitorId $secondaryVisitorId -Type "status.transition" -OccurredAt $recentStatusAt -Data @{ from = "new"; to = "engaged"; reason = "recent contact" }

Write-Host "[assert-ops-followups] POST /api/formation/events FOLLOWUP_ASSIGNED (secondary visitor with same assigned timestamp) ..."
Add-FormationEvent -VisitorId $secondaryVisitorId -Type "FOLLOWUP_ASSIGNED" -OccurredAt $reassignAt -Metadata @{ assigneeId = "ops-user-1" }

Start-Sleep -Milliseconds 250

Write-Host "[assert-ops-followups] GET /ops/followups (risk ordering check) ..."
$fuPriority = GetFollowups
$primaryPriorityItem = GetFollowupItem -Items $fuPriority.items -VisitorId $primaryVisitorId
$secondaryPriorityItem = GetFollowupItem -Items $fuPriority.items -VisitorId $secondaryVisitorId
Assert-HighRiskUrgentItem -Item $primaryPriorityItem -VisitorId $primaryVisitorId
Assert-LowRiskNormalPriorityItem -Item $secondaryPriorityItem -VisitorId $secondaryVisitorId
Assert-VisitorSortsBefore -Items $fuPriority.items -FirstVisitorId $primaryVisitorId -SecondVisitorId $secondaryVisitorId -Message "Expected high-risk followup item to sort ahead of low-risk item when assigned timestamps match."

# 8) Assigned timestamp dominance: newer assignment should outrank older assignment even when risk is lower
Write-Host "[assert-ops-followups] POST /api/visitors (assignedAt dominance pair) ..."
$olderHighRiskVisitorId = New-Visitor -FirstName "Ops" -LastName "AssignedOlderHigh" -Prefix "ops-followups-older-high"
$newerLowRiskVisitorId = New-Visitor -FirstName "Ops" -LastName "AssignedNewerLow" -Prefix "ops-followups-newer-low"

Write-Host "[assert-ops-followups] POST /api/engagements/events (newer low-risk visitor recent signals) ..."
$newerLowRiskNoteAt = $now.AddMinutes(-4).ToString("o")
$newerLowRiskStatusAt = $now.AddMinutes(-1).ToString("o")
Add-EngagementEvent -VisitorId $newerLowRiskVisitorId -Type "note.add" -OccurredAt $newerLowRiskNoteAt -Data @{ text = "recent note for assignedAt ordering" }
Add-EngagementEvent -VisitorId $newerLowRiskVisitorId -Type "status.transition" -OccurredAt $newerLowRiskStatusAt -Data @{ from = "new"; to = "engaged"; reason = "assignedAt ordering" }

$olderAssignedAt = $now.AddSeconds(10).ToString("o")
$newerAssignedAt = $now.AddSeconds(11).ToString("o")

Write-Host "[assert-ops-followups] POST /api/formation/events FOLLOWUP_ASSIGNED (older high-risk visitor) ..."
Add-FormationEvent -VisitorId $olderHighRiskVisitorId -Type "FOLLOWUP_ASSIGNED" -OccurredAt $olderAssignedAt -Metadata @{ assigneeId = "ops-user-1" }

Write-Host "[assert-ops-followups] POST /api/formation/events FOLLOWUP_ASSIGNED (newer low-risk visitor) ..."
Add-FormationEvent -VisitorId $newerLowRiskVisitorId -Type "FOLLOWUP_ASSIGNED" -OccurredAt $newerAssignedAt -Metadata @{ assigneeId = "ops-user-1" }

Start-Sleep -Milliseconds 250

Write-Host "[assert-ops-followups] GET /ops/followups (assignedAt dominance check) ..."
$fuAssigned = GetFollowups
$olderHighRiskItem = GetFollowupItem -Items $fuAssigned.items -VisitorId $olderHighRiskVisitorId
$newerLowRiskItem = GetFollowupItem -Items $fuAssigned.items -VisitorId $newerLowRiskVisitorId
Assert-HighRiskUrgentItem -Item $olderHighRiskItem -VisitorId $olderHighRiskVisitorId
Assert-LowRiskNormalPriorityItem -Item $newerLowRiskItem -VisitorId $newerLowRiskVisitorId
Assert-VisitorSortsBefore -Items $fuAssigned.items -FirstVisitorId $newerLowRiskVisitorId -SecondVisitorId $olderHighRiskVisitorId -Message "Expected newer assignment to sort ahead of older assignment even when newer item has lower engagement risk."

# 9) Final visitorId tie-break: identical assignedAt, identical risk, identical queue state
Write-Host "[assert-ops-followups] POST /api/visitors (visitorId tie-break pair) ..."
$tieVisitorAId = New-Visitor -FirstName "Ops" -LastName "TieA" -Prefix "ops-followups-tie-a"
$tieVisitorBId = New-Visitor -FirstName "Ops" -LastName "TieB" -Prefix "ops-followups-tie-b"

$tieAssignedAt = $now.AddSeconds(12).ToString("o")

Write-Host "[assert-ops-followups] POST /api/formation/events FOLLOWUP_ASSIGNED (visitorId tie-break pair) ..."
Add-FormationEvent -VisitorId $tieVisitorAId -Type "FOLLOWUP_ASSIGNED" -OccurredAt $tieAssignedAt -Metadata @{ assigneeId = "ops-user-1" }
Add-FormationEvent -VisitorId $tieVisitorBId -Type "FOLLOWUP_ASSIGNED" -OccurredAt $tieAssignedAt -Metadata @{ assigneeId = "ops-user-1" }

Start-Sleep -Milliseconds 250

Write-Host "[assert-ops-followups] GET /ops/followups (visitorId tie-break check) ..."
$fuTie = GetFollowups
$tieVisitorAItem = GetFollowupItem -Items $fuTie.items -VisitorId $tieVisitorAId
$tieVisitorBItem = GetFollowupItem -Items $fuTie.items -VisitorId $tieVisitorBId
Assert-HighRiskUrgentItem -Item $tieVisitorAItem -VisitorId $tieVisitorAId
Assert-HighRiskUrgentItem -Item $tieVisitorBItem -VisitorId $tieVisitorBId

$expectedTieFirstVisitorId = $tieVisitorAId
$expectedTieSecondVisitorId = $tieVisitorBId
if ([string]::CompareOrdinal($tieVisitorAId, $tieVisitorBId) -gt 0) {
  $expectedTieFirstVisitorId = $tieVisitorBId
  $expectedTieSecondVisitorId = $tieVisitorAId
}

Assert-VisitorSortsBefore -Items $fuTie.items -FirstVisitorId $expectedTieFirstVisitorId -SecondVisitorId $expectedTieSecondVisitorId -Message "Expected visitorId lexical order to act as the final tie-break when queue items are otherwise identical."

# 10) Timestamp precision edge: 1 ms later assignment should sort first when all else is equal
Write-Host "[assert-ops-followups] POST /api/visitors (millisecond precision pair) ..."
$msEarlierVisitorId = New-Visitor -FirstName "Ops" -LastName "MsEarlier" -Prefix "ops-followups-ms-earlier"
$msLaterVisitorId = New-Visitor -FirstName "Ops" -LastName "MsLater" -Prefix "ops-followups-ms-later"

$msEarlierAssignedAt = $now.AddSeconds(13).ToString("o")
$msLaterAssignedAt = $now.AddSeconds(13).AddMilliseconds(1).ToString("o")

Write-Host "[assert-ops-followups] POST /api/formation/events FOLLOWUP_ASSIGNED (millisecond precision pair) ..."
Add-FormationEvent -VisitorId $msEarlierVisitorId -Type "FOLLOWUP_ASSIGNED" -OccurredAt $msEarlierAssignedAt -Metadata @{ assigneeId = "ops-user-1" }
Add-FormationEvent -VisitorId $msLaterVisitorId -Type "FOLLOWUP_ASSIGNED" -OccurredAt $msLaterAssignedAt -Metadata @{ assigneeId = "ops-user-1" }

Start-Sleep -Milliseconds 250

Write-Host "[assert-ops-followups] GET /ops/followups (millisecond precision check) ..."
$fuMs = GetFollowups
$msEarlierItem = GetFollowupItem -Items $fuMs.items -VisitorId $msEarlierVisitorId
$msLaterItem = GetFollowupItem -Items $fuMs.items -VisitorId $msLaterVisitorId
Assert-HighRiskUrgentItem -Item $msEarlierItem -VisitorId $msEarlierVisitorId
Assert-HighRiskUrgentItem -Item $msLaterItem -VisitorId $msLaterVisitorId
Assert-VisitorSortsBefore -Items $fuMs.items -FirstVisitorId $msLaterVisitorId -SecondVisitorId $msEarlierVisitorId -Message "Expected assignment ordering to respect millisecond timestamp precision."

# 11) Resolve all seeded visitors so the regression cleans up after itself
$cleanupVisitorIds = @(
  $primaryVisitorId,
  $secondaryVisitorId,
  $olderHighRiskVisitorId,
  $newerLowRiskVisitorId,
  $tieVisitorAId,
  $tieVisitorBId,
  $msEarlierVisitorId,
  $msLaterVisitorId
)

$cleanupBase = $now.AddSeconds(20)
for ($i = 0; $i -lt $cleanupVisitorIds.Count; $i++) {
  $visitorId = $cleanupVisitorIds[$i]
  $cleanupAt = $cleanupBase.AddSeconds($i).ToString("o")
  Write-Host ("[assert-ops-followups] POST /api/formation/events FOLLOWUP_OUTCOME_RECORDED ({0}) ..." -f $visitorId)
  Add-FormationEvent -VisitorId $visitorId -Type "FOLLOWUP_OUTCOME_RECORDED" -OccurredAt $cleanupAt -Metadata @{ outcome = "resolved_by_regression" }
}

Start-Sleep -Milliseconds 250

Write-Host "[assert-ops-followups] GET /ops/followups (after outcomes) ..."
$fuO = GetFollowups
foreach ($visitorId in $cleanupVisitorIds) {
  $resolvedItem = GetFollowupItem -Items $fuO.items -VisitorId $visitorId
  if ($resolvedItem) {
    throw "Expected visitorId=$visitorId to be resolved and not present after outcome."
  }
}

Write-Host "[assert-ops-followups] OK: followups lifecycle + ordering invariants regression passed." -ForegroundColor Green









