param(
  [string]$BaseUrl = "http://localhost:7071",
  [string]$ApiKey = $env:HOPE_API_KEY
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

Write-Host "Running summary vs engagement-status consistency invariant..."

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
      name  = "Summary Engagement Consistency Test"
      email = "summary-engagement-consistency+$([guid]::NewGuid().ToString('N'))@test.com"
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
    source = @{ system = "assert-summary-engagement-status-consistency" }
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

function Get-EngagementStatus([string]$VisitorId) {
  return Invoke-RestMethod `
    -Method GET `
    -Uri "$BaseUrl/api/engagements/status?visitorId=$([Uri]::EscapeDataString($VisitorId))" `
    -Headers (Get-Headers)
}

function Get-VisitorSummary([string]$VisitorId) {
  return Invoke-RestMethod `
    -Method GET `
    -Uri "$BaseUrl/api/visitors/$([Uri]::EscapeDataString($VisitorId))/summary" `
    -Headers (Get-Headers)
}

function Read-StatusValue($StatusBody) {
  if ($null -eq $StatusBody) { return $null }

  if ($StatusBody.PSObject.Properties.Name -contains "status") {
    return [string]$StatusBody.status
  }

  if ($StatusBody.PSObject.Properties.Name -contains "currentStatus") {
    return [string]$StatusBody.currentStatus
  }

  if (($StatusBody.PSObject.Properties.Name -contains "data") -and $null -ne $StatusBody.data) {
    if ($StatusBody.data.PSObject.Properties.Name -contains "status") {
      return [string]$StatusBody.data.status
    }

    if ($StatusBody.data.PSObject.Properties.Name -contains "currentStatus") {
      return [string]$StatusBody.data.currentStatus
    }
  }

  return $null
}

function Read-SummaryEngagementStatus($SummaryBody) {
  if ($null -eq $SummaryBody) { return $null }

  if (($SummaryBody.PSObject.Properties.Name -contains "summary") -and $null -ne $SummaryBody.summary) {
    $summary = $SummaryBody.summary

    if (($summary.PSObject.Properties.Name -contains "engagement") -and $null -ne $summary.engagement) {
      $engagement = $summary.engagement

      if ($engagement.PSObject.Properties.Name -contains "status") {
        return [string]$engagement.status
      }

      if ($engagement.PSObject.Properties.Name -contains "currentStatus") {
        return [string]$engagement.currentStatus
      }
    }
  }

  return $null
}

$visitorId = Create-TestVisitor
$base = (Get-Date).ToUniversalTime().AddMinutes(-5)

Write-Host "[test] posting valid transitions"
Post-Transition -VisitorId $visitorId -From "NEW" -To "ENGAGED" -OccurredAt $base
Start-Sleep -Milliseconds 50
Post-Transition -VisitorId $visitorId -From "ENGAGED" -To "DISENGAGED" -OccurredAt $base.AddSeconds(1)
Start-Sleep -Milliseconds 50
Post-Transition -VisitorId $visitorId -From "DISENGAGED" -To "ENGAGED" -OccurredAt $base.AddSeconds(2)

Write-Host "[test] reading engagement status"
$statusBody = Get-EngagementStatus -VisitorId $visitorId
$statusValue = Read-StatusValue $statusBody

Write-Host "[debug] engagement status response:"
$statusBody | ConvertTo-Json -Depth 6 | Write-Host

Write-Host "[test] reading visitor summary"
$summaryBody = Get-VisitorSummary -VisitorId $visitorId
$summaryStatusValue = Read-SummaryEngagementStatus $summaryBody

Write-Host "[debug] visitor summary response:"
$summaryBody | ConvertTo-Json -Depth 6 | Write-Host

Assert (-not [string]::IsNullOrWhiteSpace($statusValue)) "engagement status response did not expose a status value"
Assert (-not [string]::IsNullOrWhiteSpace($summaryStatusValue)) "visitor summary did not expose engagement status"
Assert ($statusValue -eq $summaryStatusValue) "summary engagement status '$summaryStatusValue' did not match engagement status '$statusValue'"
Assert ($statusValue -eq "ENGAGED") "expected final derived engagement status ENGAGED; got '$statusValue'"

Write-Host "Summary vs engagement-status consistency invariant passed."
