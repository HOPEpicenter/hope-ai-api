param(
  [Parameter(Mandatory = $true)]
  [string]$ApiBase,

  [Parameter(Mandatory = $false)]
  [string]$ApiKey = $env:HOPE_API_KEY,

  [Parameter(Mandatory = $false)]
  [int]$VisitorLimit = 500,

  [Parameter(Mandatory = $false)]
  [int]$TimelineLimit = 200,

  [Parameter(Mandatory = $false)]
  [int]$ChunkSize = 25,

  [Parameter(Mandatory = $false)]
  [string[]]$VisitorIds = @()
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

function Get-RequiredApiKey {
  param([string]$Value)

  $text = [string]::new($Value ?? "").Trim()
  if ([string]::IsNullOrWhiteSpace($text)) {
    throw "Missing API key. Pass -ApiKey or set HOPE_API_KEY."
  }

  return $text
}

function Get-Headers {
  param([string]$Key)

  return @{
    "x-api-key" = $Key
  }
}

function Get-SafeOccurredAt {
  param($Event)

  if ($null -ne $Event.PSObject.Properties["occurredAt"] -and -not [string]::IsNullOrWhiteSpace([string]$Event.occurredAt)) {
    return [string]$Event.occurredAt
  }

  if ($null -ne $Event.PSObject.Properties["happenedAt"] -and -not [string]::IsNullOrWhiteSpace([string]$Event.happenedAt)) {
    return [string]$Event.happenedAt
  }

  return (Get-Date).ToString("o")
}

function Get-VisitorIdsFromApi {
  param(
    [string]$Base,
    [hashtable]$Headers,
    [int]$Limit
  )

  $resp = Invoke-RestMethod "$Base/visitors?limit=$Limit" -Headers $Headers

  if ($null -eq $resp -or $null -eq $resp.items) {
    return @()
  }

  $ids = @()
  foreach ($item in $resp.items) {
    if ($null -ne $item.PSObject.Properties["visitorId"] -and -not [string]::IsNullOrWhiteSpace([string]$item.visitorId)) {
      $ids += [string]$item.visitorId
    }
  }

  return $ids
}

function Get-ChunkedArrays {
  param(
    [string[]]$Items,
    [int]$Size
  )

  $chunks = [System.Collections.Generic.List[object]]::new()

  for ($i = 0; $i -lt $Items.Count; $i += $Size) {
    $end = [math]::Min($i + $Size - 1, $Items.Count - 1)
    $chunks.Add($Items[$i..$end])
  }

  return $chunks
}

function New-FormationBodyFromTimelineEvent {
  param(
    [string]$VisitorId,
    $Event
  )

  $type = [string]$Event.type
  $data = @{}

  if ($type -eq "FOLLOWUP_ASSIGNED" -and $null -ne $Event.PSObject.Properties["data"] -and $null -ne $Event.data -and $null -ne $Event.data.PSObject.Properties["assigneeId"]) {
    $data.assigneeId = [string]$Event.data.assigneeId
  }

  if ($type -eq "FOLLOWUP_OUTCOME_RECORDED" -and $null -ne $Event.PSObject.Properties["data"] -and $null -ne $Event.data -and $null -ne $Event.data.PSObject.Properties["outcome"]) {
    $data.outcome = [string]$Event.data.outcome
  }

  if ($type -eq "FOLLOWUP_OUTCOME_RECORDED" -and $null -ne $Event.PSObject.Properties["data"] -and $null -ne $Event.data -and $null -ne $Event.data.PSObject.Properties["notes"]) {
    $data.notes = [string]$Event.data.notes
  }

  return @{
    v = 1
    eventId = [guid]::NewGuid().ToString()
    visitorId = $VisitorId
    type = $type
    occurredAt = Get-SafeOccurredAt -Event $Event
    source = @{ system = "backfill" }
    data = $data
  }
}

$apiKey = Get-RequiredApiKey -Value $ApiKey
$headers = Get-Headers -Key $apiKey
$base = $ApiBase.TrimEnd("/")

$targetVisitorIds = @()
if ($VisitorIds.Count -gt 0) {
  $targetVisitorIds = $VisitorIds
} else {
  $targetVisitorIds = Get-VisitorIdsFromApi -Base $base -Headers $headers -Limit $VisitorLimit
}

if ($targetVisitorIds.Count -eq 0) {
  Write-Host "No visitors found to backfill." -ForegroundColor Yellow
  exit 0
}

Write-Host "Visitors to process: $($targetVisitorIds.Count)" -ForegroundColor Cyan

$chunks = Get-ChunkedArrays -Items $targetVisitorIds -Size $ChunkSize

$replayed = 0
$skipped = 0
$failedTimeline = 0

foreach ($chunk in $chunks) {
  Write-Host ""
  Write-Host "=== Processing chunk of $($chunk.Count) visitors ===" -ForegroundColor Cyan

  foreach ($vid in $chunk) {
    Write-Host "Visitor: $vid" -ForegroundColor DarkCyan

    try {
      $timeline = Invoke-RestMethod "$base/engagements/$vid/timeline?limit=$TimelineLimit" -Headers $headers
    } catch {
      $failedTimeline++
      Write-Host "Failed to fetch timeline" -ForegroundColor Red
      continue
    }

    if ($null -eq $timeline.items -or $timeline.items.Count -eq 0) {
      continue
    }

    foreach ($evt in $timeline.items) {
      $type = [string]$evt.type

      if ($type -notin @(
        "FOLLOWUP_ASSIGNED",
        "FOLLOWUP_CONTACTED",
        "FOLLOWUP_OUTCOME_RECORDED",
        "FOLLOWUP_UNASSIGNED"
      )) {
        continue
      }

      $body = New-FormationBodyFromTimelineEvent -VisitorId $vid -Event $evt

      try {
        Invoke-RestMethod "$base/formation/events" `
          -Method Post `
          -Headers $headers `
          -ContentType "application/json" `
          -Body ($body | ConvertTo-Json -Depth 10) | Out-Null

        $replayed++
      } catch {
        $skipped++
      }
    }
  }

  Start-Sleep -Seconds 2
}

Write-Host ""
Write-Host "Backfill complete." -ForegroundColor Green
Write-Host "Replayed: $replayed"
Write-Host "Skipped:  $skipped"
Write-Host "Timeline failures: $failedTimeline"
