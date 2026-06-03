param(
  [string]$ApiBase = "http://127.0.0.1:7071/api",
  [string]$ApiKey = $env:HOPE_API_KEY
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

if ([string]::IsNullOrWhiteSpace($ApiKey)) {
  throw "HOPE_API_KEY is required."
}

$api = $ApiBase.Trim().TrimEnd("/")
$ops = "$api/ops"
$headers = @{ "x-api-key" = $ApiKey }

function Assert([bool]$Condition, [string]$Message) {
  if (-not $Condition) {
    throw "ASSERT FAILED: $Message"
  }
}

function Json-Get([string]$Url) {
  Invoke-RestMethod -Method GET -Uri $Url -Headers $headers
}

function Json-Post([string]$Url, [object]$Body) {
  Invoke-RestMethod `
    -Method POST `
    -Uri $Url `
    -Headers $headers `
    -ContentType "application/json" `
    -Body ($Body | ConvertTo-Json -Depth 30)
}

function New-EventId {
  "evt-$([guid]::NewGuid().ToString('N'))"
}

function Get-FollowupItem($Items, [string]$VisitorId) {
  @($Items) | Where-Object { [string]$_.visitorId -eq $VisitorId } | Select-Object -First 1
}

function Get-JourneyStep([string]$VisitorId) {
  $journey = Json-Get "$api/visitors/$([Uri]::EscapeDataString($VisitorId))/journey"
  return [string]$journey.currentStep
}

function Get-Summary([string]$VisitorId) {
  Json-Get "$api/visitors/$([Uri]::EscapeDataString($VisitorId))/summary"
}

function Get-Profile([string]$VisitorId) {
  $response = Json-Get "$api/visitors/$([Uri]::EscapeDataString($VisitorId))/formation/profile"
  return $response.profile
}

function Get-TaskEligibilityFromFollowup($Followup, $Audit) {
  $projectionHealthy = (($Audit.drifted -eq $false) -and ($Audit.profileBehind -eq $false))

  return (
    ($Followup.followupResolved -ne $true) -and
    ($null -ne $Followup.assignedTo) -and
    (-not [string]::IsNullOrWhiteSpace([string]$Followup.assignedTo.ownerId)) -and
    $projectionHealthy
  )
}

Write-Host "=== ASSERT: Cross-surface derivation contracts ==="
Write-Host "ApiBase=$api"

$visitor = Json-Post "$api/visitors" @{
  name = "Cross Surface Derivation"
  email = "cross-surface-derivation+$([guid]::NewGuid().ToString('N'))@example.org"
  source = "assert-cross-surface-derivation-contracts.ps1"
}

$visitorId = [string]$visitor.visitorId
Assert (-not [string]::IsNullOrWhiteSpace($visitorId)) "visitorId should exist"

$base = (Get-Date).ToUniversalTime().AddMinutes(-10)
$ownerId = "ops-user-1"

Write-Host "[scenario 1] baseline visitor"

$summary0 = Get-Summary $visitorId
$journey0 = Get-JourneyStep $visitorId
$ops0 = Json-Get "$ops/followups?visitorId=$([Uri]::EscapeDataString($visitorId))&includeResolved=true&limit=10"

Assert ($journey0 -eq "NEW") "baseline journey should be NEW"
Assert ([string]$summary0.summary.journey.currentStep -eq "NEW") "baseline summary journey should be NEW"
Assert ($null -eq (Get-FollowupItem -Items $ops0.items -VisitorId $visitorId)) "baseline visitor should not have followup row"

Write-Host "[scenario 2] engagement event"

Json-Post "$api/engagements/events" @{
  v = 1
  eventId = New-EventId
  visitorId = $visitorId
  type = "status.transition"
  occurredAt = $base.AddSeconds(1).ToString("o")
  source = @{ system = "assert-cross-surface-derivation-contracts"; actorId = $ownerId }
  data = @{ from = "NEW"; to = "ENGAGED" }
} | Out-Null

Start-Sleep -Milliseconds 150

$summary1 = Get-Summary $visitorId
$journey1 = Get-JourneyStep $visitorId
$ops1 = Json-Get "$ops/followups?visitorId=$([Uri]::EscapeDataString($visitorId))&includeResolved=true&limit=10"

Assert ($journey1 -eq "ENGAGED") "engaged journey should be ENGAGED"
Assert ([string]$summary1.summary.journey.currentStep -eq "ENGAGED") "engaged summary journey should be ENGAGED"
Assert ([string]$summary1.summary.engagement.status -eq "ENGAGED") "summary engagement status should be ENGAGED"
Assert ($null -eq (Get-FollowupItem -Items $ops1.items -VisitorId $visitorId)) "engaged-only visitor should not have followup row"

Write-Host "[scenario 3] followup assigned"

Json-Post "$api/formation/events" @{
  v = 1
  eventId = New-EventId
  visitorId = $visitorId
  type = "FOLLOWUP_ASSIGNED"
  occurredAt = $base.AddSeconds(2).ToString("o")
  source = @{ system = "assert-cross-surface-derivation-contracts"; actorId = $ownerId }
  data = @{ assigneeId = $ownerId }
} | Out-Null

Start-Sleep -Milliseconds 250

$summary2 = Get-Summary $visitorId
$journey2 = Get-JourneyStep $visitorId
$profile2 = Get-Profile $visitorId
$ops2 = Json-Get "$ops/followups?visitorId=$([Uri]::EscapeDataString($visitorId))&includeResolved=false&limit=10"
$item2 = Get-FollowupItem -Items $ops2.items -VisitorId $visitorId
$audit2 = Json-Post "$api/_ops/formation/profile-audit" @{ visitorId = $visitorId; repair = $false }

Assert ($journey2 -eq "ENGAGED") "assigned journey should remain ENGAGED"
Assert ([string]$summary2.summary.journey.currentStep -eq "ENGAGED") "assigned summary journey should remain ENGAGED"
Assert ([string]$profile2.assignedTo -eq $ownerId) "profile assignedTo should match owner"
Assert ($summary2.summary.integration.needsFollowup -eq $true) "summary needsFollowup should be true after assignment"
Assert ($summary2.summary.integration.followupResolved -eq $false) "summary followupResolved should be false after assignment"
Assert ($null -ne $item2) "assigned visitor should appear in default ops followups"
Assert ($item2.followupResolved -ne $true) "assigned ops followup should be unresolved"
Assert ([string]$item2.assignedTo.ownerId -eq $ownerId) "ops owner should match profile assignedTo"
Assert ((Get-TaskEligibilityFromFollowup -Followup $item2 -Audit $audit2) -eq $true) "assigned followup should be task eligible"

Write-Host "[scenario 4] followup contacted"

Json-Post "$api/formation/events" @{
  v = 1
  eventId = New-EventId
  visitorId = $visitorId
  type = "FOLLOWUP_CONTACTED"
  occurredAt = $base.AddSeconds(3).ToString("o")
  source = @{ system = "assert-cross-surface-derivation-contracts"; actorId = $ownerId }
  data = @{ method = "sms"; result = "connected" }
} | Out-Null

Start-Sleep -Milliseconds 250

$summary3 = Get-Summary $visitorId
$journey3 = Get-JourneyStep $visitorId
$profile3 = Get-Profile $visitorId
$ops3 = Json-Get "$ops/followups?visitorId=$([Uri]::EscapeDataString($visitorId))&includeResolved=false&limit=10"
$item3 = Get-FollowupItem -Items $ops3.items -VisitorId $visitorId
$audit3 = Json-Post "$api/_ops/formation/profile-audit" @{ visitorId = $visitorId; repair = $false }

Assert ($journey3 -eq "ENGAGED") "contacted journey should remain ENGAGED"
Assert ([string]$summary3.summary.journey.currentStep -eq "ENGAGED") "contacted summary journey should remain ENGAGED"
Assert (-not [string]::IsNullOrWhiteSpace([string]$profile3.lastFollowupContactedAt)) "profile should expose contact timestamp"
Assert ($summary3.summary.integration.needsFollowup -eq $true) "summary needsFollowup should remain true after contact"
Assert ($summary3.summary.integration.followupResolved -eq $false) "summary followupResolved should remain false after contact"
Assert ($null -ne $item3) "contacted visitor should remain in default ops followups"
Assert ((Get-TaskEligibilityFromFollowup -Followup $item3 -Audit $audit3) -eq $true) "contacted followup should remain task eligible"

Write-Host "[scenario 5] followup outcome connected"

Json-Post "$api/formation/events" @{
  v = 1
  eventId = New-EventId
  visitorId = $visitorId
  type = "FOLLOWUP_OUTCOME_RECORDED"
  occurredAt = $base.AddSeconds(4).ToString("o")
  source = @{ system = "assert-cross-surface-derivation-contracts"; actorId = $ownerId }
  data = @{ outcome = "connected" }
} | Out-Null

Start-Sleep -Milliseconds 500

$summary4 = Get-Summary $visitorId
$journey4 = Get-JourneyStep $visitorId
$profile4 = Get-Profile $visitorId
$opsDefault4 = Json-Get "$ops/followups?visitorId=$([Uri]::EscapeDataString($visitorId))&includeResolved=false&limit=10"
$opsIncluded4 = Json-Get "$ops/followups?visitorId=$([Uri]::EscapeDataString($visitorId))&includeResolved=true&limit=10"
$itemDefault4 = Get-FollowupItem -Items $opsDefault4.items -VisitorId $visitorId
$itemIncluded4 = Get-FollowupItem -Items $opsIncluded4.items -VisitorId $visitorId
$audit4 = Json-Post "$api/_ops/formation/profile-audit" @{ visitorId = $visitorId; repair = $false }

Assert ($journey4 -eq "ENGAGED") "resolved followup should not promote journey beyond ENGAGED"
Assert ([string]$summary4.summary.journey.currentStep -eq "ENGAGED") "resolved summary journey should remain ENGAGED"
Assert ([string]$profile4.lastFollowupOutcome -eq "connected") "profile outcome should be canonical connected"
Assert ($summary4.summary.integration.followupResolved -eq $true) "summary followupResolved should be true after connected outcome"
Assert ($summary4.summary.integration.needsFollowup -eq $false) "summary needsFollowup should be false after connected outcome"
Assert ($null -eq $itemDefault4) "resolved visitor should be excluded from default ops followups"
Assert ($null -ne $itemIncluded4) "resolved visitor should be included when includeResolved=true"
Assert ($itemIncluded4.followupResolved -eq $true) "includeResolved item should expose followupResolved=true"
Assert ((Get-TaskEligibilityFromFollowup -Followup $itemIncluded4 -Audit $audit4) -eq $false) "resolved followup should not be task eligible"

Write-Host "OK: cross-surface derivation contracts assertion passed." -ForegroundColor Green