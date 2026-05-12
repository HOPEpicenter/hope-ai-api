param(
  [string]$BaseUrl = "http://127.0.0.1:7071",
  [string]$ApiKey = ""
)

$ErrorActionPreference = "Stop"
$ApiBase = ($BaseUrl.TrimEnd("/") + "/api")

$headers = @{
  "content-type" = "application/json"
}

if (-not [string]::IsNullOrWhiteSpace($ApiKey)) {
  $headers["x-api-key"] = $ApiKey
}

function Assert($cond, [string]$msg) {
  if (-not $cond) {
    throw "ASSERT FAILED: $msg"
  }
}

function To-JsonBody($body) {
  return ($body | ConvertTo-Json -Depth 30)
}

function Json-Get([string]$Url) {
  return Invoke-RestMethod -Method Get -Uri $Url -Headers $headers
}

function Json-Post([string]$Url, [hashtable]$Body) {
  return Invoke-RestMethod -Method Post -Uri $Url -Headers $headers -Body (To-JsonBody $Body)
}

function New-EventId([string]$prefix) {
  return ("evt-" + [Guid]::NewGuid().ToString("N"))
}

function New-IsoUtc([datetime]$value) {
  return $value.ToUniversalTime().ToString("o")
}

function Create-TestVisitor {
  $email = "cross-surface+" + [Guid]::NewGuid().ToString("N") + "@example.com"

  $visitor = Json-Post "$ApiBase/visitors" @{
    name = "Cross Surface Consistency"
    email = $email
    source = "assert-cross-surface-consistency.ps1"
  }

  Assert (-not [string]::IsNullOrWhiteSpace([string]$visitor.visitorId)) "visitorId should be returned"
  return [string]$visitor.visitorId
}

function Post-EngagementEvent([string]$VisitorId, [string]$Type, [datetime]$OccurredAt, [hashtable]$Data) {
  return Json-Post "$ApiBase/engagements/events" @{
    v = 1
    eventId = New-EventId "evt-eng-cross"
    visitorId = $VisitorId
    type = $Type
    occurredAt = New-IsoUtc $OccurredAt
    source = @{
      system = "scripts/assert-cross-surface-consistency.ps1"
    }
    data = $Data
  }
}

function Post-FormationEvent([string]$VisitorId, [string]$Type, [datetime]$OccurredAt, [hashtable]$Data) {
  return Json-Post "$ApiBase/formation/events" @{
    v = 1
    eventId = New-EventId "evt-form-cross"
    visitorId = $VisitorId
    type = $Type
    occurredAt = New-IsoUtc $OccurredAt
    source = @{
      system = "scripts/assert-cross-surface-consistency.ps1"
    }
    data = $Data
  }
}

Write-Host "=== ASSERT: Cross-surface consistency ==="
Write-Host "ApiBase=$ApiBase"

$health = Json-Get "$ApiBase/health"
Assert ([bool]$health.ok) "health should be ok"

$visitorId = Create-TestVisitor
Write-Host "visitorId=$visitorId"

$base = (Get-Date).ToUniversalTime().AddMinutes(-10)

Write-Host "Posting canonical lifecycle..."

Post-EngagementEvent $visitorId "note.add" $base.AddSeconds(5) @{
  text = "Cross-surface consistency seed"
} | Out-Null

Post-EngagementEvent $visitorId "status.transition" $base.AddSeconds(10) @{
  from = "new"
  to = "active"
} | Out-Null

Post-FormationEvent $visitorId "FOLLOWUP_ASSIGNED" $base.AddSeconds(20) @{
  assigneeId = "ops-cross-surface-1"
  displayName = "Ops Cross Surface"
} | Out-Null

Post-FormationEvent $visitorId "FOLLOWUP_CONTACTED" $base.AddSeconds(30) @{
  method = "text"
  result = "connected"
} | Out-Null

Post-FormationEvent $visitorId "NEXT_STEP_SELECTED" $base.AddSeconds(40) @{
  nextStep = "Join Group"
} | Out-Null

Post-FormationEvent $visitorId "FOLLOWUP_OUTCOME_RECORDED" $base.AddSeconds(50) @{
  outcome = "connected"
  notes = "cross-surface assertion outcome"
} | Out-Null

Start-Sleep -Milliseconds 750

Write-Host "Rebuilding formation profile projection..."
$rebuild = Json-Post "$ApiBase/visitors/$([Uri]::EscapeDataString($visitorId))/formation/profile/rebuild" @{}
Assert ([bool]$rebuild.ok) "profile rebuild should return ok=true"

Start-Sleep -Milliseconds 250

Write-Host "Fetching surfaces..."

$summary = Json-Get "$ApiBase/visitors/$([Uri]::EscapeDataString($visitorId))/summary"
$card = Json-Get "$ApiBase/visitors/$([Uri]::EscapeDataString($visitorId))/dashboard-card"
$profileResponse = Json-Get "$ApiBase/visitors/$([Uri]::EscapeDataString($visitorId))/formation/profile"
$profile = $profileResponse.profile
$formationEvents = Json-Get "$ApiBase/visitors/$([Uri]::EscapeDataString($visitorId))/formation/events?limit=20"
$engagementTimeline = Json-Get "$ApiBase/engagements/timeline?visitorId=$([Uri]::EscapeDataString($visitorId))&limit=20"
$integrationTimeline = Json-Get "$ApiBase/integration/timeline?visitorId=$([Uri]::EscapeDataString($visitorId))&limit=20"
$opsFollowups = Json-Get "$ApiBase/ops/followups?visitorId=$([Uri]::EscapeDataString($visitorId))&includeResolved=true&limit=20"

Write-Host "Asserting profile + event truth..."

Assert ([string]$profile.visitorId -eq $visitorId) "profile visitorId should match"
Assert ([string]$profile.lastFollowupOutcome -eq "connected") "profile should have connected outcome"
Assert (-not [string]::IsNullOrWhiteSpace([string]$profile.lastFollowupOutcomeAt)) "profile should have outcome timestamp"
Assert ([string]$profile.assignedTo -eq "ops-cross-surface-1") "profile assignedTo should match latest assignment"
Assert ([string]$profile.lastEventType -eq "FOLLOWUP_OUTCOME_RECORDED") "profile lastEventType should be outcome"

$formationTypes = @($formationEvents.items | ForEach-Object { [string]$_.type })
Assert ($formationTypes -contains "FOLLOWUP_ASSIGNED") "formation events should include assignment"
Assert ($formationTypes -contains "FOLLOWUP_CONTACTED") "formation events should include contact"
Assert ($formationTypes -contains "NEXT_STEP_SELECTED") "formation events should include next step"
Assert ($formationTypes -contains "FOLLOWUP_OUTCOME_RECORDED") "formation events should include outcome"

Write-Host "Asserting timelines..."

$engTypes = @($engagementTimeline.items | ForEach-Object { [string]$_.type })
Assert ($engTypes -contains "note.add") "engagement timeline should include note.add"
Assert ($engTypes -contains "status.transition") "engagement timeline should include status.transition"

$integrationTypes = @($integrationTimeline.items | ForEach-Object { [string]$_.type })
Assert ($integrationTypes -contains "note.add") "integration timeline should include note.add"
Assert ($integrationTypes -contains "status.transition") "integration timeline should include status.transition"
Assert ($integrationTypes -contains "FOLLOWUP_ASSIGNED") "integration timeline should include assignment"
Assert ($integrationTypes -contains "FOLLOWUP_CONTACTED") "integration timeline should include contact"
Assert ($integrationTypes -contains "NEXT_STEP_SELECTED") "integration timeline should include next step"
Assert ($integrationTypes -contains "FOLLOWUP_OUTCOME_RECORDED") "integration timeline should include outcome"

Write-Host "Asserting ops followups resolved state..."

$opsItems = @($opsFollowups.items)
Assert ($opsItems.Count -ge 1) "ops followups includeResolved should return this visitor"

$opsItem = $opsItems | Where-Object { [string]$_.visitorId -eq $visitorId } | Select-Object -First 1
Assert ($null -ne $opsItem) "ops followups should include visitor row"
Assert ([bool]$opsItem.followupResolved) "ops followups row should be resolved"
Assert ([string]$opsItem.assignedTo.ownerId -eq "ops-cross-surface-1") "ops followups owner should match profile assignment"

Write-Host "Asserting summary/card availability..."

Assert ($null -ne $summary) "visitor summary should load"
Assert ($null -ne $card) "dashboard card should load"

Write-Host "OK: cross-surface consistency assertion passed." -ForegroundColor Green




