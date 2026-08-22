param(
  [string]$BaseUrl = 'https://hope-ai-api-staging.azurewebsites.net/api',
  [string]$ApiKey = $env:HOPE_API_KEY,
  [string]$VisitorId = $env:PHASE4_VISITOR_ID,
  [switch]$ExpectDisabled,
  [int]$TimeoutSeconds = 30
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

function Assert([bool]$Condition, [string]$Message) {
  if (-not $Condition) {
    throw "ASSERT FAILED: $Message"
  }
}

function Require-Value([string]$Name, [string]$Value) {
  if ([string]::IsNullOrWhiteSpace($Value)) {
    throw "$Name is required. Provide -$Name or set env:$Name."
  }

  return $Value.Trim()
}

function Invoke-Phase4Get([string]$Path, [hashtable]$Headers, [int]$TimeoutSeconds) {
  $response = Invoke-WebRequest `
    -Method Get `
    -Uri $Path `
    -Headers $Headers `
    -TimeoutSec $TimeoutSeconds `
    -SkipHttpErrorCheck

  $content = [string]$response.Content
  $body = if ([string]::IsNullOrWhiteSpace($content)) {
    $null
  } else {
    $content | ConvertFrom-Json -AsHashTable
  }

  return [pscustomobject]@{
    StatusCode = [int]$response.StatusCode
    Body = $body
  }
}

$apiBase = (Require-Value 'BaseUrl' $BaseUrl).TrimEnd('/')
$apiKey = Require-Value 'ApiKey' $ApiKey
$visitorId = Require-Value 'VisitorId' $VisitorId
$headers = @{ 'x-api-key' = $apiKey; accept = 'application/json' }

$paths = @(
  @{ Name = 'aggregate'; Path = "/person/$([uri]::EscapeDataString($visitorId))/aggregate" },
  @{ Name = 'timeline'; Path = "/person/$([uri]::EscapeDataString($visitorId))/timeline" },
  @{ Name = 'readiness'; Path = "/person/$([uri]::EscapeDataString($visitorId))/readiness" },
  @{ Name = 'snapshot'; Path = "/person/$([uri]::EscapeDataString($visitorId))/snapshot" }
)

Write-Host "Phase 4 staging acceptance"
Write-Host "ApiBase=$apiBase"
Write-Host "VisitorId=$visitorId"
Write-Host "ExpectedMode=$(if ($ExpectDisabled) { 'disabled' } else { 'enabled' })"

$responses = @{}

foreach ($entry in $paths) {
  $response = Invoke-Phase4Get "$apiBase$($entry.Path)" $headers $TimeoutSeconds
  $responses[$entry.Name] = $response

  if ($ExpectDisabled) {
    Assert ($response.StatusCode -eq 503) "$($entry.Name) must return HTTP 503 while Phase 4 is disabled."
    Assert ($response.Body['ok'] -eq $false) "$($entry.Name) disabled response must return ok=false."
    Assert ($response.Body['error']['code'] -eq 'PHASE4_AGGREGATION_DISABLED') "$($entry.Name) must return PHASE4_AGGREGATION_DISABLED."
    continue
  }

  Assert ($response.StatusCode -eq 200) "$($entry.Name) must return HTTP 200 when Phase 4 is enabled."
  Assert ($response.Body['ok'] -eq $true) "$($entry.Name) enabled response must return ok=true."
}

if ($ExpectDisabled) {
  Write-Host 'Phase 4 disabled-boundary acceptance passed.' -ForegroundColor Green
  exit 0
}

$aggregate = $responses['aggregate'].Body['aggregate']
Assert ($null -ne $aggregate) 'aggregate response must include aggregate.'
Assert ($aggregate['schemaVersion'] -eq 1) 'aggregate.schemaVersion must equal 1.'
Assert ($aggregate['visitorId'] -eq $visitorId) 'aggregate.visitorId must match the requested visitor.'
Assert ($aggregate['snapshot']['schemaVersion'] -eq 2) 'aggregate.snapshot.schemaVersion must equal 2.'
Assert ($aggregate['snapshot']['visitorId'] -eq $visitorId) 'aggregate.snapshot.visitorId must match the requested visitor.'
Assert ($aggregate['ministryHealth']['score'] -is [int] -or $aggregate['ministryHealth']['score'] -is [long] -or $aggregate['ministryHealth']['score'] -is [double]) 'aggregate.ministryHealth.score must be numeric.'
Assert ($aggregate['ministryHealth']['score'] -ge 0 -and $aggregate['ministryHealth']['score'] -le 100) 'aggregate.ministryHealth.score must be within 0..100.'
Assert (@('HEALTHY', 'WATCH', 'NEEDS_ATTENTION') -contains $aggregate['ministryHealth']['band']) 'aggregate.ministryHealth.band is invalid.'
Assert ($aggregate['readiness'] -is [System.Collections.IEnumerable]) 'aggregate.readiness must be an array.'
Assert ($aggregate['timeline'] -is [System.Collections.IEnumerable]) 'aggregate.timeline must be an array.'

$readiness = $responses['readiness'].Body
Assert ($readiness['visitorId'] -eq $visitorId) 'readiness.visitorId must match the requested visitor.'
Assert ($readiness['readiness'] -is [System.Collections.IEnumerable]) 'readiness.readiness must be an array.'
Assert ($null -ne $readiness['ministryHealth']) 'readiness must include ministryHealth.'

foreach ($signal in @($readiness['readiness'])) {
  Assert (-not [string]::IsNullOrWhiteSpace([string]$signal['signal'])) 'Each readiness item needs signal.'
  Assert (@('routine', 'elevated', 'urgent') -contains $signal['priority']) 'Each readiness priority is invalid.'
  Assert (@('engagement', 'formation', 'six_week_followup') -contains $signal['source']) 'Each readiness source is invalid.'
  Assert (-not [string]::IsNullOrWhiteSpace([string]$signal['reason'])) 'Each readiness item needs reason.'
}

$timeline = $responses['timeline'].Body
Assert ($timeline['visitorId'] -eq $visitorId) 'timeline.visitorId must match the requested visitor.'
Assert ($timeline['timeline'] -is [System.Collections.IEnumerable]) 'timeline.timeline must be an array.'
Assert ($null -eq $timeline['nextCursor']) 'timeline.nextCursor must be null for Phase 4 v1.'

$snapshot = $responses['snapshot'].Body
Assert ($snapshot['visitorId'] -eq $visitorId) 'snapshot.visitorId must match the requested visitor.'
Assert ($snapshot['snapshot']['schemaVersion'] -eq 2) 'snapshot.schemaVersion must equal 2.'
Assert ($snapshot['snapshot']['visitorId'] -eq $visitorId) 'snapshot.visitorId must match the requested visitor.'

Write-Host 'Phase 4 enabled staging acceptance passed.' -ForegroundColor Green
