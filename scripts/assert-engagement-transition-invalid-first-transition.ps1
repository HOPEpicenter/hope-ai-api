param(
  [string]$BaseUrl = "http://localhost:7071",
  [string]$ApiKey = $env:HOPE_API_KEY
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

Write-Host "Running invalid-first-transition engagement invariant..."

function Get-Headers {
  if ([string]::IsNullOrWhiteSpace($ApiKey)) {
    throw "HOPE_API_KEY required"
  }

  return @{ "x-api-key" = $ApiKey }
}

function Assert([bool]$Condition, [string]$Message) {
  if (-not $Condition) {
    throw $Message
  }
}

function Create-TestVisitor {
  $response = Invoke-RestMethod `
    -Method POST `
    -Uri "$BaseUrl/api/visitors" `
    -ContentType "application/json" `
    -Body (@{
      name  = "Invalid First Transition Test"
      email = "invalid-first-transition+$([guid]::NewGuid().ToString('N'))@test.com"
    } | ConvertTo-Json)

  $visitorId = [string]$response.visitorId
  Assert (-not [string]::IsNullOrWhiteSpace($visitorId)) "visitorId missing from create visitor response"

  return $visitorId
}

function Post-Transition(
  [string]$VisitorId,
  [string]$From,
  [string]$To,
  [datetime]$OccurredAt
) {
  $event = @{
    v = 1
    eventId = "evt-$([guid]::NewGuid().ToString('N'))"
    visitorId = $VisitorId
    type = "status.transition"
    occurredAt = $OccurredAt.ToUniversalTime().ToString("o")
    source = @{ system = "assert-engagement-transition-invalid-first-transition" }
    data = @{
      from = $From
      to   = $To
    }
  } | ConvertTo-Json -Depth 10

  $response = Invoke-RestMethod `
    -Method POST `
    -Uri "$BaseUrl/api/engagements/events" `
    -Headers (Get-Headers) `
    -ContentType "application/json" `
    -Body $event

  Write-Host "[debug] posted: $From -> $To :: ok=$($response.ok)"
}

function Get-Timeline([string]$VisitorId) {
  return Invoke-RestMethod `
    -Method GET `
    -Uri "$BaseUrl/api/engagements/$VisitorId/timeline?limit=10" `
    -Headers (Get-Headers)
}

function Get-Status([string]$VisitorId) {
  return Invoke-RestMethod `
    -Method GET `
    -Uri "$BaseUrl/api/engagements/status?visitorId=$([Uri]::EscapeDataString($VisitorId))" `
    -Headers (Get-Headers)
}

$visitorId = Create-TestVisitor
$base = (Get-Date).ToUniversalTime().AddMinutes(-5)

Write-Host "[test] posting invalid then valid transitions"

Post-Transition -VisitorId $visitorId -From "DISENGAGED" -To "DISENGAGED" -OccurredAt $base
Start-Sleep -Milliseconds 50

Post-Transition -VisitorId $visitorId -From "NEW" -To "ENGAGED" -OccurredAt $base.AddSeconds(1)
Start-Sleep -Milliseconds 50

Post-Transition -VisitorId $visitorId -From "ENGAGED" -To "DISENGAGED" -OccurredAt $base.AddSeconds(2)
Start-Sleep -Milliseconds 50

Post-Transition -VisitorId $visitorId -From "DISENGAGED" -To "ENGAGED" -OccurredAt $base.AddSeconds(3)

Write-Host "[test] reading raw timeline"
$timeline = Get-Timeline -VisitorId $visitorId
$items = @($timeline.items)

Write-Host "[debug] timeline count: $($items.Count)"
$items | ConvertTo-Json -Depth 5 | Write-Host

Assert ($items.Count -ge 4) "expected at least 4 timeline items"

$rawInvalid = @(
  $items | Where-Object {
    $_.type -eq "status.transition" -and
    $_.data.from -eq "DISENGAGED" -and
    $_.data.to -eq "DISENGAGED"
  }
)

Assert ($rawInvalid.Count -ge 1) "expected raw invalid first transition to exist in timeline"

Write-Host "[test] reading derived status"
$statusResponse = Get-Status -VisitorId $visitorId
$statusBody = $statusResponse

Write-Host "[debug] status response:"
$statusBody | ConvertTo-Json -Depth 5 | Write-Host

$derivedStatus = $null
if ($statusBody.PSObject.Properties.Name -contains "status") {
  $derivedStatus = [string]$statusBody.status
}
elseif ($statusBody.PSObject.Properties.Name -contains "currentStatus") {
  $derivedStatus = [string]$statusBody.currentStatus
}
elseif ($statusBody.PSObject.Properties.Name -contains "data" -and $null -ne $statusBody.data) {
  if ($statusBody.data.PSObject.Properties.Name -contains "status") {
    $derivedStatus = [string]$statusBody.data.status
  }
  elseif ($statusBody.data.PSObject.Properties.Name -contains "currentStatus") {
    $derivedStatus = [string]$statusBody.data.currentStatus
  }
}

Assert ($derivedStatus -eq "ENGAGED") "expected derived status ENGAGED after ignoring invalid initial transition; got '$derivedStatus'"

Write-Host "Invalid-first-transition invariant passed."
