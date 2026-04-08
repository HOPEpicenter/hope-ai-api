param(
  [string]$ApiBase = "http://127.0.0.1:7071/api",
  [string]$ApiKey = $env:HOPE_API_KEY
)

$ErrorActionPreference = "Stop"

if ([string]::IsNullOrWhiteSpace($ApiKey)) {
  throw "HOPE_API_KEY env var is required."
}

function New-Headers {
  return @{ "x-api-key" = $ApiKey }
}

function Post-Json {
  param(
    [Parameter(Mandatory=$true)][string]$Uri,
    [Parameter(Mandatory=$true)][object]$Body
  )
  Invoke-RestMethod -Method POST -Uri $Uri -Headers (New-Headers) -ContentType "application/json" -Body ($Body | ConvertTo-Json -Depth 20)
}

function Get-Json {
  param([Parameter(Mandatory=$true)][string]$Uri)
  Invoke-RestMethod -Method GET -Uri $Uri -Headers (New-Headers)
}

function Assert-True {
  param(
    [Parameter(Mandatory=$true)][bool]$Condition,
    [Parameter(Mandatory=$true)][string]$Message
  )
  if (-not $Condition) { throw $Message }
}

Write-Host "[integration-group-joined] test start"

$visitor = Post-Json -Uri "$ApiBase/visitors" -Body @{
  name   = "integration-group-joined"
  email  = ("integration-group-joined-" + (Get-Date -Format "yyyyMMddHHmmssfff") + "@example.com")
  source = "assert-integration-group-joined"
}

$visitorId = [string]$visitor.visitorId
Assert-True (-not [string]::IsNullOrWhiteSpace($visitorId)) "visitorId missing"

$groupId = "group-alpha"
$displayName = "Alpha Group"

$evt = @{
  v          = 1
  eventId    = ("fevt-" + [Guid]::NewGuid().ToString("N"))
  visitorId  = $visitorId
  type       = "GROUP_JOINED"
  occurredAt = (Get-Date).ToUniversalTime().ToString("o")
  source     = @{ system = "assert-integration-group-joined" }
  data       = @{
    groupId     = $groupId
    displayName = $displayName
  }
}

Post-Json -Uri "$ApiBase/formation/events" -Body $evt | Out-Null

Start-Sleep -Milliseconds 250

$summary = Get-Json -Uri ("$ApiBase/integration/summary?visitorId={0}" -f $visitorId)

Assert-True ($summary.ok -eq $true) "expected ok=true"
Assert-True ($summary.v -eq 1) "expected v=1"
Assert-True ($null -ne $summary.summary) "expected summary"
Assert-True ($summary.summary.sources.formation -eq $true) "expected sources.formation=true"
Assert-True ($null -ne $summary.summary.groups) "expected groups present"
Assert-True ($summary.summary.groups.Count -ge 1) "expected at least one group"
Assert-True ([string]$summary.summary.groups[0].groupId -eq $groupId) "expected groupId='$groupId'"

Write-Host "[integration-group-joined] OK" -ForegroundColor Green