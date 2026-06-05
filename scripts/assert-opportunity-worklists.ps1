# scripts/assert-opportunity-worklists.ps1
# Regression: Activity Intelligence opportunity worklists stay backend-authoritative and contract-stable.
# PowerShell 7+.

[CmdletBinding()]
param(
  [Parameter(Mandatory=$false)]
  [string]$BaseUrl,

  [Parameter(Mandatory=$false)]
  [string]$ApiBase,

  [Parameter(Mandatory=$false)]
  [string]$ApiKey
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"
$ProgressPreference = "SilentlyContinue"

function Normalize-Base([string]$u) {
  if ([string]::IsNullOrWhiteSpace($u)) { return "" }
  return $u.Trim().TrimEnd("/")
}

function Require-ApiKey([string]$k) {
  if ([string]::IsNullOrWhiteSpace($k)) {
    throw "HOPE_API_KEY is required (set env:HOPE_API_KEY or pass -ApiKey)."
  }
  return $k
}

function Assert-True([bool]$Condition, [string]$Message) {
  if (-not $Condition) {
    throw $Message
  }
}

function Assert-Equal($Actual, $Expected, [string]$Message) {
  if ($Actual -ne $Expected) {
    throw ("{0} Expected={1} Actual={2}" -f $Message, $Expected, $Actual)
  }
}

$BaseUrl = Normalize-Base $BaseUrl
$ApiBase = Normalize-Base $ApiBase

if (-not $ApiBase) {
  if (-not $BaseUrl) {
    throw "Provide -BaseUrl or -ApiBase."
  }

  $ApiBase = "$BaseUrl/api"
}

if ([string]::IsNullOrWhiteSpace($ApiKey)) {
  $ApiKey = (Get-Item ("env:" + "HOPE_API_KEY") -ErrorAction SilentlyContinue).Value
}
$ApiKey = Require-ApiKey $ApiKey

$headers = @{ "x-api-key" = $ApiKey }

Write-Host ("[assert-opportunity-worklists] ApiBase={0}" -f $ApiBase)

function GetJson([string]$url) {
  return Invoke-RestMethod -Method Get -Uri $url -Headers $headers
}

function ExpectHttpStatus([string]$url, [int]$ExpectedStatus) {
  try {
    Invoke-RestMethod -Method Get -Uri $url -Headers $headers | Out-Null
    throw "Expected HTTP $ExpectedStatus but request succeeded: $url"
  } catch {
    $statusCode = 0
    try {
      $statusCode = [int]$_.Exception.Response.StatusCode
    } catch {
      throw "Expected HTTP $ExpectedStatus but could not read status code for: $url"
    }

    if ($statusCode -ne $ExpectedStatus) {
      throw "Expected HTTP $ExpectedStatus but got HTTP $statusCode for: $url"
    }
  }
}

$segments = @(
  @{
    segment = "connected-without-next-step"
    recommendedAction = "Select next step"
  },
  @{
    segment = "next-step-selected-not-completed"
    recommendedAction = "Encourage next step completion"
  },
  @{
    segment = "active-care-without-outcome"
    recommendedAction = "Record care outcome"
  },
  @{
    segment = "connected-without-care-owner"
    recommendedAction = "Assign care owner"
  }
)

foreach ($entry in $segments) {
  $segment = [string]$entry.segment
  $expectedAction = [string]$entry.recommendedAction

  Write-Host ("[assert-opportunity-worklists] GET segment={0}" -f $segment)

  $url = "$ApiBase/activity-intelligence/opportunities/${segment}?limit=5"
  $res = GetJson $url

  Assert-Equal $res.ok $true "Expected ok=true."
  Assert-Equal $res.segment $segment "Expected response segment to match request."
  Assert-True (-not [string]::IsNullOrWhiteSpace([string]$res.label)) "Expected label to be present."
  Assert-True ($null -ne $res.count) "Expected count to be present."
  Assert-True ($null -ne $res.items) "Expected items array to be present."
  Assert-True (-not [string]::IsNullOrWhiteSpace([string]$res.generatedAt)) "Expected generatedAt to be present."

  $items = @($res.items)
  Assert-True ($items.Count -le 5) "Expected limit=5 to return at most 5 items."

  foreach ($item in $items) {
    Assert-True (-not [string]::IsNullOrWhiteSpace([string]$item.visitorId)) "Expected item visitorId."
    Assert-True (-not [string]::IsNullOrWhiteSpace([string]$item.href)) "Expected item href."
    Assert-True ($item.href.StartsWith("/visitors/")) "Expected item href to target visitor surface."
    Assert-True ($null -ne $item.recommendedAction) "Expected recommendedAction."
    Assert-Equal $item.recommendedAction.label $expectedAction "Expected recommendedAction label to match segment."
  }

  $limitOneUrl = "$ApiBase/activity-intelligence/opportunities/${segment}?limit=1"
  $page1 = GetJson $limitOneUrl
  Assert-Equal $page1.ok $true "Expected limit=1 response ok=true."
  Assert-True (@($page1.items).Count -le 1) "Expected limit=1 to return at most one item."

  if (-not [string]::IsNullOrWhiteSpace([string]$page1.cursor)) {
    $cursor = [Uri]::EscapeDataString([string]$page1.cursor)
    $page2Url = "$ApiBase/activity-intelligence/opportunities/${segment}?limit=1&cursor=$cursor"
    $page2 = GetJson $page2Url
    $page2Replay = GetJson $page2Url

    Assert-Equal $page2.ok $true "Expected page2 response ok=true."
    Assert-Equal $page2Replay.ok $true "Expected page2 replay response ok=true."

    $page2Ids = @($page2.items | ForEach-Object { [string]$_.visitorId })
    $page2ReplayIds = @($page2Replay.items | ForEach-Object { [string]$_.visitorId })

    Assert-Equal $page2ReplayIds.Count $page2Ids.Count "Expected page2 replay count to match page2."

    for ($i = 0; $i -lt $page2Ids.Count; $i++) {
      Assert-Equal $page2ReplayIds[$i] $page2Ids[$i] "Expected page2 replay visitor ordering to match."
    }

    Assert-Equal ([string]$page2Replay.cursor) ([string]$page2.cursor) "Expected page2 replay cursor to match."
  }
}

Write-Host "[assert-opportunity-worklists] GET invalid segment returns 400"
ExpectHttpStatus "$ApiBase/activity-intelligence/opportunities/not-a-real-segment" 400

Write-Host "[assert-opportunity-worklists] OK: opportunity worklists regression passed." -ForegroundColor Green
