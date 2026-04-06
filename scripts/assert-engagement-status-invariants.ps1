param(
  [string]$ApiBase = "http://127.0.0.1:7071/api",
  [string]$ApiKey = $env:HOPE_API_KEY
)

$ErrorActionPreference = "Stop"

if ([string]::IsNullOrWhiteSpace($ApiKey)) {
  throw "HOPE_API_KEY env var is required."
}

try {
  Invoke-WebRequest -Method GET -Uri "$ApiBase/health" -UseBasicParsing -TimeoutSec 5 | Out-Null
} catch {
  throw "API is not reachable at $ApiBase. Start Functions host first."
}

function Assert-True {
  param(
    [Parameter(Mandatory=$true)][bool]$Condition,
    [Parameter(Mandatory=$true)][string]$Message
  )
  if (-not $Condition) { throw $Message }
}

function New-Headers {
  @{ "x-api-key" = $ApiKey }
}

function Post-Json {
  param(
    [Parameter(Mandatory=$true)][string]$Uri,
    [Parameter(Mandatory=$true)][object]$Body
  )

  Invoke-RestMethod `
    -Method POST `
    -Uri $Uri `
    -Headers (New-Headers) `
    -ContentType "application/json" `
    -Body ($Body | ConvertTo-Json -Depth 20)
}

function Get-Json {
  param([Parameter(Mandatory=$true)][string]$Uri)

  Invoke-RestMethod `
    -Method GET `
    -Uri $Uri `
    -Headers (New-Headers)
}

function New-Visitor {
  param([Parameter(Mandatory=$true)][string]$Tag)

  $body = @{
    name   = "engagement-status-$Tag"
    email  = ("engagement-status-" + $Tag + "-" + (Get-Date -Format "yyyyMMddHHmmssfff") + "@example.com")
    source = "assert-engagement-status-invariants"
  }

  Post-Json -Uri "$ApiBase/visitors" -Body $body
}

function Post-EngagementEvent {
  param(
    [Parameter(Mandatory=$true)][string]$VisitorId,
    [Parameter(Mandatory=$true)][string]$OccurredAt,
    [Parameter(Mandatory=$true)][string]$Type,
    [Parameter(Mandatory=$true)][hashtable]$Data
  )

  $body = @{
    v          = 1
    eventId    = ("evt-" + [Guid]::NewGuid().ToString("N"))
    visitorId  = $VisitorId
    type       = $Type
    occurredAt = $OccurredAt
    source     = @{ system = "assert-engagement-status-invariants" }
    data       = $Data
  }

  Post-Json -Uri "$ApiBase/engagements/events" -Body $body | Out-Null
}

function Get-Status {
  param([Parameter(Mandatory=$true)][string]$VisitorId)

  Get-Json -Uri "$ApiBase/engagements/status?visitorId=$VisitorId"
}

Write-Host "[engagement-status-invariants] test start"

$visitorNew = New-Visitor -Tag "baseline"
$statusNew = Get-Status -VisitorId $visitorNew.visitorId
Assert-True ($null -eq $statusNew.status) "Expected baseline status null, got $($statusNew.status)"
Write-Host "[engagement-status-invariants] baseline null OK"

$visitorNote = New-Visitor -Tag "note"
$t0 = (Get-Date).ToUniversalTime()
Post-EngagementEvent -VisitorId $visitorNote.visitorId -OccurredAt $t0.ToString("o") -Type "note.add" -Data @{
  text = "hello"
  channel = "api"
}
$statusNote = Get-Status -VisitorId $visitorNote.visitorId
Assert-True ($null -eq $statusNote.status) "Expected note-only status null, got $($statusNote.status)"
Write-Host "[engagement-status-invariants] note-only null OK"

$visitorEngaged = New-Visitor -Tag "engaged"
$t1 = (Get-Date).ToUniversalTime()
Post-EngagementEvent -VisitorId $visitorEngaged.visitorId -OccurredAt $t1.ToString("o") -Type "status.transition" -Data @{
  from = "unknown"
  to   = "engaged"
}
$statusEngaged = Get-Status -VisitorId $visitorEngaged.visitorId
Assert-True ($statusEngaged.status -eq "engaged") "Expected engaged status, got $($statusEngaged.status)"
Write-Host "[engagement-status-invariants] engaged transition OK"

$visitorDisengaged = New-Visitor -Tag "disengaged"
$t2 = (Get-Date).ToUniversalTime()
Post-EngagementEvent -VisitorId $visitorDisengaged.visitorId -OccurredAt $t2.ToString("o") -Type "status.transition" -Data @{
  from = "unknown"
  to   = "engaged"
}
Post-EngagementEvent -VisitorId $visitorDisengaged.visitorId -OccurredAt $t2.AddSeconds(1).ToString("o") -Type "status.transition" -Data @{
  from = "engaged"
  to   = "disengaged"
}
$statusDisengaged = Get-Status -VisitorId $visitorDisengaged.visitorId
Assert-True ($statusDisengaged.status -eq "disengaged") "Expected disengaged status, got $($statusDisengaged.status)"
Write-Host "[engagement-status-invariants] disengaged transition OK"

Write-Host "[engagement-status-invariants] ALL OK"

