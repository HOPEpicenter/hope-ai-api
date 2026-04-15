param(
  [Parameter(Mandatory = $true)][string]$ApiBase,
  [Parameter(Mandatory = $true)][string]$ApiKey,
  [int]$VisitorLimit = 200,
  [int]$TimelineLimit = 200,
  [int]$ChunkSize = 25
)

$ErrorActionPreference = 'Stop'

$base = $ApiBase.TrimEnd('/')
$headers = @{
  'x-api-key' = $ApiKey
}

$replayed = 0
$skipped = 0
$timelineFailures = 0

function New-FormationBodyFromTimelineEvent {
  param(
    [Parameter(Mandatory = $true)][string]$VisitorId,
    [Parameter(Mandatory = $true)]$Event
  )

  if (-not $Event) { return $null }
  if (-not ($Event.PSObject.Properties.Name -contains 'type')) { return $null }

  $type = [string]$Event.type
  if ([string]::IsNullOrWhiteSpace($type)) { return $null }

  $occurredAt = $Event.occurredAt
  if (-not $occurredAt) {
    $occurredAt = (Get-Date).ToUniversalTime().ToString('o')
  }

  $eventData = @{}
  if ($Event.PSObject.Properties.Name -contains 'data' -and $null -ne $Event.data) {
    $eventData = $Event.data
  }

  switch ($type) {
    'FOLLOWUP_ASSIGNED' {
      $assigneeId = $eventData.assigneeId
      if (-not $assigneeId) { $assigneeId = 'ops-user-1' }

      $data = @{
        assigneeId = $assigneeId
      }
    }

    'FOLLOWUP_CONTACTED' {
      $data = @{
        channel = $eventData.channel ?? 'unknown'
      }
    }

    'FOLLOWUP_OUTCOME_RECORDED' {
      $outcome = $eventData.outcome
      if (-not $outcome) { $outcome = 'unknown' }

      $data = @{
        outcome = $outcome
      }
    }

    'FOLLOWUP_UNASSIGNED' {
      $data = @{}
    }

    default {
      return $null
    }
  }

  return @{
    v = 1
    eventId = "evt-$([Guid]::NewGuid().ToString('N'))"
    visitorId = $VisitorId
    type = $type
    occurredAt = $occurredAt
    source = @{ system = 'backfill' }
    data = $data
  }
}

$visitorsResponse = Invoke-RestMethod `
  -Method GET `
  -Uri "$base/visitors?limit=$VisitorLimit" `
  -Headers $headers

$visitorIds = @($visitorsResponse.items | Select-Object -ExpandProperty visitorId)

Write-Host "Visitors to process: $($visitorIds.Count)" -ForegroundColor Cyan

foreach ($vid in $visitorIds) {
  Write-Host "Visitor: $vid" -ForegroundColor Cyan

  try {
    $timeline = Invoke-RestMethod `
      -Method GET `
      -Uri "$base/engagements/$vid/timeline?limit=$TimelineLimit" `
      -Headers $headers
  }
  catch {
    $timelineFailures++
    continue
  }

  $items = @($timeline.items)

  if ($items.Count -eq 0) {
    continue
  }

  $events = @(
    $items | Where-Object {
      $_ -and $_.type -in @(
        'FOLLOWUP_ASSIGNED',
        'FOLLOWUP_CONTACTED',
        'FOLLOWUP_OUTCOME_RECORDED',
        'FOLLOWUP_UNASSIGNED'
      )
    }
  )

  if ($events.Count -eq 0) {
    continue
  }

  foreach ($evt in $events) {
    $body = New-FormationBodyFromTimelineEvent -VisitorId $vid -Event $evt

    if (-not $body) {
      $skipped++
      continue
    }

    $json = $body | ConvertTo-Json -Depth 20

    try {
      Invoke-RestMethod `
        -Method POST `
        -Uri "$base/formation/events" `
        -Headers $headers `
        -ContentType 'application/json' `
        -Body $json | Out-Null

      $replayed++
    }
    catch {
      $skipped++
      Write-Host "FAILED for $vid" -ForegroundColor Red
      Write-Host $_.Exception.Message -ForegroundColor Yellow
    }
  }
}

Write-Host ""
Write-Host "Backfill complete." -ForegroundColor Green
Write-Host "Replayed: $replayed"
Write-Host "Skipped:  $skipped"
Write-Host "Timeline failures: $timelineFailures"
