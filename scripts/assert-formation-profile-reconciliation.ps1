param(
  [string]$BaseUrl = "http://localhost:7071",
  [string]$ApiKey = $env:HOPE_API_KEY
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

function Assert([bool]$Condition, [string]$Message) {
  if (-not $Condition) {
    throw "ASSERT FAILED: $Message"
  }
}

function Get-Headers {
  if ([string]::IsNullOrWhiteSpace($ApiKey)) {
    throw "HOPE_API_KEY required"
  }

  return @{ "x-api-key" = $ApiKey }
}

function Json-Post([string]$Url, [object]$Body) {
  Invoke-RestMethod `
    -Method POST `
    -Uri $Url `
    -Headers (Get-Headers) `
    -ContentType "application/json" `
    -Body ($Body | ConvertTo-Json -Depth 20)
}

function Json-Get([string]$Url) {
  Invoke-RestMethod `
    -Method GET `
    -Uri $Url `
    -Headers (Get-Headers)
}

function To-UtcDto($Value) {
  if ($Value -is [DateTimeOffset]) { return $Value.ToUniversalTime() }
  if ($Value -is [DateTime]) { return ([DateTimeOffset]$Value).ToUniversalTime() }
  return [DateTimeOffset]::Parse([string]$Value).ToUniversalTime()
}

function To-IsoMillis($Value) {
  if ($null -eq $Value) { return $null }
  return (To-UtcDto $Value).ToString("yyyy-MM-ddTHH:mm:ss.fffZ")
}

function New-EventId([string]$Prefix) {
  return "$Prefix-$([Guid]::NewGuid().ToString('N'))"
}

function Get-EventMetadataData($Event) {
  $metadata = $Event.metadata

  if ($metadata -is [string]) {
    try {
      $metadata = $metadata | ConvertFrom-Json
    } catch {
      return [pscustomobject]@{}
    }
  }

  if ($metadata -and $metadata.PSObject.Properties.Match("data").Count -gt 0) {
    return $metadata.data
  }

  if ($metadata) {
    return $metadata
  }

  return [pscustomobject]@{}
}

function Create-TestVisitor {
  $stamp = [Guid]::NewGuid().ToString("N")
  $created = Json-Post `
    -Url "$ApiBase/visitors" `
    -Body @{
      name = "Formation Reconciliation $($stamp.Substring(0, 8))"
      email = "formation-reconciliation+$stamp@example.com"
    }

  $visitorId = [string]$created.visitorId
  Assert (-not [string]::IsNullOrWhiteSpace($visitorId)) "visitorId missing from create response"

  return $visitorId
}

function Post-FormationEvent {
  param(
    [string]$VisitorId,
    [string]$EventId,
    [string]$Type,
    [DateTime]$OccurredAt,
    [hashtable]$Data
  )

  $body = @{
    v = 1
    eventId = $EventId
    visitorId = $VisitorId
    type = $Type
    occurredAt = $OccurredAt.ToUniversalTime().ToString("o")
    source = @{ system = "assert-formation-profile-reconciliation" }
    data = $Data
  }

  $response = Json-Post -Url "$ApiBase/formation/events" -Body $body
  Assert ([bool]$response.ok) "formation event post should return ok=true for $Type"

  return $response
}

function Get-FormationProfile([string]$VisitorId) {
  $profile = Json-Get -Url "$ApiBase/visitors/$([Uri]::EscapeDataString($VisitorId))/formation/profile"
  Assert ([bool]$profile.ok) "formation profile response should be ok=true"
  return $profile.profile
}

function Get-FormationEvents([string]$VisitorId) {
  $events = Json-Get -Url "$ApiBase/visitors/$([Uri]::EscapeDataString($VisitorId))/formation/events?limit=200"
  Assert ([bool]$events.ok) "formation events response should be ok=true"
  return @($events.items)
}

function Compare-CanonicalEvent($A, $B) {
  $aAt = To-IsoMillis $A.occurredAt
  $bAt = To-IsoMillis $B.occurredAt

  if ($aAt -ne $bAt) {
    return [string]::CompareOrdinal($aAt, $bAt)
  }

  return [string]::CompareOrdinal([string]$A.id, [string]$B.id)
}

function Derive-ExpectedProfileFromEvents($Events) {
  $expected = [ordered]@{
    assignedTo = $null
    lastFollowupAssignedAt = $null
    lastFollowupContactedAt = $null
    lastFollowupOutcomeAt = $null
    lastFollowupOutcome = $null
    lastNextStepAt = $null
    lastEventType = $null
    lastEventAt = $null
    lastEventId = $null
    stage = $null
    stageUpdatedAt = $null
    stageReason = $null
  }

  $ordered = @($Events) | Sort-Object `
    @{ Expression = { To-IsoMillis $_.occurredAt }; Ascending = $true },
    @{ Expression = { [string]$_.id }; Ascending = $true }

  foreach ($event in $ordered) {
    $eventAt = To-IsoMillis $event.occurredAt

    $currentWinner = $null
    if ($expected.lastEventAt) {
      $currentWinner = [pscustomobject]@{
        occurredAt = $expected.lastEventAt
        id = $expected.lastEventId
      }
    }

    if ($null -eq $currentWinner -or (Compare-CanonicalEvent $event $currentWinner) -gt 0) {
      $expected.lastEventType = [string]$event.type
      $expected.lastEventAt = $eventAt
      $expected.lastEventId = [string]$event.id
    }

    if ($event.type -eq "FOLLOWUP_ASSIGNED") {
      if ($null -eq $expected.lastFollowupAssignedAt -or $eventAt -gt $expected.lastFollowupAssignedAt) {
        $expected.lastFollowupAssignedAt = $eventAt
        $expected.assignedTo = [string](Get-EventMetadataData $event).assigneeId
      }

      if ($expected.stage -ne "Guest") {
        $expected.stage = "Guest"
        $expected.stageUpdatedAt = $eventAt
        $expected.stageReason = "event:FOLLOWUP_ASSIGNED"
      }
    }

    if ($event.type -eq "FOLLOWUP_UNASSIGNED") {
      if ($expected.lastEventId -eq [string]$event.id) {
        $expected.assignedTo = $null
      }
    }

    if ($event.type -eq "FOLLOWUP_CONTACTED") {
      if ($null -eq $expected.lastFollowupContactedAt -or $eventAt -gt $expected.lastFollowupContactedAt) {
        $expected.lastFollowupContactedAt = $eventAt
      }
    }

    if ($event.type -eq "FOLLOWUP_OUTCOME_RECORDED") {
      if ($null -eq $expected.lastFollowupOutcomeAt -or $eventAt -gt $expected.lastFollowupOutcomeAt) {
        $expected.lastFollowupOutcomeAt = $eventAt
        $expected.lastFollowupOutcome = [string](Get-EventMetadataData $event).outcome
      }

      if ($expected.stage -ne "Connected") {
        $expected.stage = "Connected"
        $expected.stageUpdatedAt = $eventAt
        $expected.stageReason = "event:FOLLOWUP_OUTCOME_RECORDED"
      }
    }

    if ($event.type -eq "NEXT_STEP_SELECTED") {
      if ($null -eq $expected.lastNextStepAt -or $eventAt -gt $expected.lastNextStepAt) {
        $expected.lastNextStepAt = $eventAt
      }

      if ($expected.stage -ne "Connected") {
        $expected.stage = "Connected"
        $expected.stageUpdatedAt = $eventAt
        $expected.stageReason = "event:NEXT_STEP_SELECTED"
      }
    }
  }

  return [pscustomobject]$expected
}

$ApiBase = $BaseUrl.TrimEnd("/") + "/api"

Write-Host "[assert-formation-profile-reconciliation] ApiBase=$ApiBase"

$visitorId = Create-TestVisitor
Write-Host "[assert-formation-profile-reconciliation] visitorId=$visitorId"

$baseTime = (Get-Date).ToUniversalTime().AddMinutes(-10)

Post-FormationEvent `
  -VisitorId $visitorId `
  -EventId (New-EventId "evt-recon-assign-a") `
  -Type "FOLLOWUP_ASSIGNED" `
  -OccurredAt $baseTime `
  -Data @{ assigneeId = "ops-user-1" } | Out-Null

Post-FormationEvent `
  -VisitorId $visitorId `
  -EventId (New-EventId "evt-recon-contact") `
  -Type "FOLLOWUP_CONTACTED" `
  -OccurredAt $baseTime.AddSeconds(10) `
  -Data @{ method = "phone"; result = "connected" } | Out-Null

Post-FormationEvent `
  -VisitorId $visitorId `
  -EventId (New-EventId "evt-recon-unassign") `
  -Type "FOLLOWUP_UNASSIGNED" `
  -OccurredAt $baseTime.AddSeconds(20) `
  -Data @{ reason = "reconciliation test" } | Out-Null

Post-FormationEvent `
  -VisitorId $visitorId `
  -EventId (New-EventId "evt-recon-assign-b") `
  -Type "FOLLOWUP_ASSIGNED" `
  -OccurredAt $baseTime.AddSeconds(30) `
  -Data @{ assigneeId = "ops-user-2" } | Out-Null

Post-FormationEvent `
  -VisitorId $visitorId `
  -EventId (New-EventId "evt-recon-next-step") `
  -Type "NEXT_STEP_SELECTED" `
  -OccurredAt $baseTime.AddSeconds(40) `
  -Data @{ nextStep = "Attend Service" } | Out-Null

Post-FormationEvent `
  -VisitorId $visitorId `
  -EventId (New-EventId "evt-recon-outcome") `
  -Type "FOLLOWUP_OUTCOME_RECORDED" `
  -OccurredAt $baseTime.AddSeconds(50) `
  -Data @{ outcome = "connected"; notes = "profile reconciliation assertion" } | Out-Null

Start-Sleep -Milliseconds 500

$profile = Get-FormationProfile $visitorId
$events = Get-FormationEvents $visitorId
$expected = Derive-ExpectedProfileFromEvents $events



Assert ((To-IsoMillis $profile.lastEventAt) -eq $expected.lastEventAt) "lastEventAt drift"
Assert ([string]$profile.lastEventType -eq $expected.lastEventType) "lastEventType drift"
Assert ([string]$profile.lastEventId -eq $expected.lastEventId) "lastEventId drift"
Assert ([string]$profile.assignedTo -eq $expected.assignedTo) "assignedTo drift"
Assert ((To-IsoMillis $profile.lastFollowupAssignedAt) -eq $expected.lastFollowupAssignedAt) "lastFollowupAssignedAt drift"
Assert ((To-IsoMillis $profile.lastFollowupContactedAt) -eq $expected.lastFollowupContactedAt) "lastFollowupContactedAt drift"
Assert ((To-IsoMillis $profile.lastFollowupOutcomeAt) -eq $expected.lastFollowupOutcomeAt) "lastFollowupOutcomeAt drift"
Assert ([string]$profile.lastFollowupOutcome -eq $expected.lastFollowupOutcome) "lastFollowupOutcome drift"
Assert ((To-IsoMillis $profile.lastNextStepAt) -eq $expected.lastNextStepAt) "lastNextStepAt drift"
Assert ([string]$profile.stage -eq $expected.stage) "stage drift"
Assert ((To-IsoMillis $profile.stageUpdatedAt) -eq $expected.stageUpdatedAt) "stageUpdatedAt drift"
Assert ([string]$profile.stageReason -eq $expected.stageReason) "stageReason drift"

# Duplicate replay/idempotency scenario:
# Re-posting an already-seen canonical event should not drift projection state.

$duplicateEventId = $expected.lastEventId

Post-FormationEvent `
  -VisitorId $visitorId `
  -EventId $duplicateEventId `
  -Type "FOLLOWUP_OUTCOME_RECORDED" `
  -OccurredAt $baseTime.AddSeconds(50) `
  -Data @{ outcome = "connected"; notes = "duplicate replay assertion" } | Out-Null

Start-Sleep -Milliseconds 300

$profileAfterDuplicate = Get-FormationProfile $visitorId
$eventsAfterDuplicate = Get-FormationEvents $visitorId
$expectedAfterDuplicate = Derive-ExpectedProfileFromEvents $eventsAfterDuplicate

Assert ((To-IsoMillis $profileAfterDuplicate.lastEventAt) -eq $expectedAfterDuplicate.lastEventAt) "duplicate replay lastEventAt drift"
Assert ([string]$profileAfterDuplicate.lastEventType -eq $expectedAfterDuplicate.lastEventType) "duplicate replay lastEventType drift"
Assert ([string]$profileAfterDuplicate.lastEventId -eq $expectedAfterDuplicate.lastEventId) "duplicate replay lastEventId drift"
Assert ([string]$profileAfterDuplicate.assignedTo -eq $expectedAfterDuplicate.assignedTo) "duplicate replay assignedTo drift"
Assert ((To-IsoMillis $profileAfterDuplicate.lastFollowupAssignedAt) -eq $expectedAfterDuplicate.lastFollowupAssignedAt) "duplicate replay lastFollowupAssignedAt drift"
Assert ((To-IsoMillis $profileAfterDuplicate.lastFollowupContactedAt) -eq $expectedAfterDuplicate.lastFollowupContactedAt) "duplicate replay lastFollowupContactedAt drift"
Assert ((To-IsoMillis $profileAfterDuplicate.lastFollowupOutcomeAt) -eq $expectedAfterDuplicate.lastFollowupOutcomeAt) "duplicate replay lastFollowupOutcomeAt drift"
Assert ([string]$profileAfterDuplicate.lastFollowupOutcome -eq $expectedAfterDuplicate.lastFollowupOutcome) "duplicate replay lastFollowupOutcome drift"
Assert ((To-IsoMillis $profileAfterDuplicate.lastNextStepAt) -eq $expectedAfterDuplicate.lastNextStepAt) "duplicate replay lastNextStepAt drift"
Assert ([string]$profileAfterDuplicate.stage -eq $expectedAfterDuplicate.stage) "duplicate replay stage drift"
Assert ((To-IsoMillis $profileAfterDuplicate.stageUpdatedAt) -eq $expectedAfterDuplicate.stageUpdatedAt) "duplicate replay stageUpdatedAt drift"
Assert ([string]$profileAfterDuplicate.stageReason -eq $expectedAfterDuplicate.stageReason) "duplicate replay stageReason drift"

Write-Host "[assert-formation-profile-reconciliation] in-order scenario passed." -ForegroundColor Green

# Out-of-order ingestion scenario:
# Events are posted newest-to-oldest, but projection should reconcile by canonical occurredAt/eventId state.
$visitorId = Create-TestVisitor
Write-Host "[assert-formation-profile-reconciliation] outOfOrderVisitorId=$visitorId"

$baseTime = (Get-Date).ToUniversalTime().AddMinutes(-20)

$outcomeAt = $baseTime.AddSeconds(50)
$reassignAt = $baseTime.AddSeconds(40)
$unassignAt = $baseTime.AddSeconds(30)
$contactAt = $baseTime.AddSeconds(20)
$assignAt = $baseTime.AddSeconds(10)

Post-FormationEvent `
  -VisitorId $visitorId `
  -EventId (New-EventId "evt-recon-ooo-outcome") `
  -Type "FOLLOWUP_OUTCOME_RECORDED" `
  -OccurredAt $outcomeAt `
  -Data @{ outcome = "connected"; notes = "out-of-order reconciliation assertion" } | Out-Null

Post-FormationEvent `
  -VisitorId $visitorId `
  -EventId (New-EventId "evt-recon-ooo-contact") `
  -Type "FOLLOWUP_CONTACTED" `
  -OccurredAt $contactAt `
  -Data @{ method = "text"; result = "connected" } | Out-Null

Post-FormationEvent `
  -VisitorId $visitorId `
  -EventId (New-EventId "evt-recon-ooo-next-step") `
  -Type "NEXT_STEP_SELECTED" `
  -OccurredAt $baseTime.AddSeconds(60) `
  -Data @{ nextStep = "Join Group" } | Out-Null

Post-FormationEvent `
  -VisitorId $visitorId `
  -EventId (New-EventId "evt-recon-ooo-assign-a") `
  -Type "FOLLOWUP_ASSIGNED" `
  -OccurredAt $assignAt `
  -Data @{ assigneeId = "ops-user-1" } | Out-Null

Post-FormationEvent `
  -VisitorId $visitorId `
  -EventId (New-EventId "evt-recon-ooo-unassign") `
  -Type "FOLLOWUP_UNASSIGNED" `
  -OccurredAt $unassignAt `
  -Data @{ reason = "out-of-order reconciliation test" } | Out-Null

Post-FormationEvent `
  -VisitorId $visitorId `
  -EventId (New-EventId "evt-recon-ooo-assign-b") `
  -Type "FOLLOWUP_ASSIGNED" `
  -OccurredAt $reassignAt `
  -Data @{ assigneeId = "ops-user-2" } | Out-Null

Start-Sleep -Milliseconds 500

$profile = Get-FormationProfile $visitorId
$events = Get-FormationEvents $visitorId
$expected = Derive-ExpectedProfileFromEvents $events



Assert ((To-IsoMillis $profile.lastEventAt) -eq $expected.lastEventAt) "out-of-order lastEventAt drift"
Assert ([string]$profile.lastEventType -eq $expected.lastEventType) "out-of-order lastEventType drift"
Assert ([string]$profile.lastEventId -eq $expected.lastEventId) "out-of-order lastEventId drift"
Assert ([string]$profile.assignedTo -eq $expected.assignedTo) "out-of-order assignedTo drift"
Assert ((To-IsoMillis $profile.lastFollowupAssignedAt) -eq $expected.lastFollowupAssignedAt) "out-of-order lastFollowupAssignedAt drift"
Assert ((To-IsoMillis $profile.lastFollowupContactedAt) -eq $expected.lastFollowupContactedAt) "out-of-order lastFollowupContactedAt drift"
Assert ((To-IsoMillis $profile.lastFollowupOutcomeAt) -eq $expected.lastFollowupOutcomeAt) "out-of-order lastFollowupOutcomeAt drift"
Assert ([string]$profile.lastFollowupOutcome -eq $expected.lastFollowupOutcome) "out-of-order lastFollowupOutcome drift"
Assert ((To-IsoMillis $profile.lastNextStepAt) -eq $expected.lastNextStepAt) "out-of-order lastNextStepAt drift"
Assert ([string]$profile.stage -eq $expected.stage) "out-of-order stage drift"
Assert ((To-IsoMillis $profile.stageUpdatedAt) -eq $expected.stageUpdatedAt) "out-of-order stageUpdatedAt drift"
Assert ([string]$profile.stageReason -eq $expected.stageReason) "out-of-order stageReason drift"

Write-Host "[assert-formation-profile-reconciliation] OK: profile reconciles with raw formation event history for in-order and out-of-order ingestion." -ForegroundColor Green

