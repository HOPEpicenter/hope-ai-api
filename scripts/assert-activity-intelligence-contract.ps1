param(
  [string]$BaseUrl = "http://127.0.0.1:3000/api",
  [string]$ApiKey = $env:HOPE_API_KEY
)

$ErrorActionPreference = "Stop"

$ApiBase = $BaseUrl.TrimEnd("/")
if ($ApiBase -notmatch "/api$") {
  $ApiBase = "$ApiBase/api"
}

$headers = @{ "content-type" = "application/json" }
if (-not [string]::IsNullOrWhiteSpace($ApiKey)) {
  $headers["x-api-key"] = $ApiKey
}

function Assert($Condition, [string]$Message) {
  if (-not $Condition) { throw "ASSERT FAILED: $Message" }
}

Write-Host "Running activity intelligence contract..."
Write-Host "ApiBase=$ApiBase"

$res = Invoke-RestMethod -Method Get -Uri "$ApiBase/activity-intelligence" -Headers $headers

Assert ($res.ok -eq $true) "activity intelligence should return ok=true"
Assert (-not [string]::IsNullOrWhiteSpace([string]$res.requestId)) "activity intelligence should include requestId"
Assert (-not [string]::IsNullOrWhiteSpace([string]$res.generatedAt)) "activity intelligence should include generatedAt"

Assert ($null -ne $res.operationalHealth) "operationalHealth should exist"
Assert (-not [string]::IsNullOrWhiteSpace([string]$res.operationalHealth.status)) "operationalHealth.status should exist"
Assert ($null -ne $res.operationalHealth.reasons) "operationalHealth.reasons should exist"

Assert ($null -ne $res.careLoad) "careLoad should exist"
foreach ($field in @("totalCandidates","urgentCount","staleCount","escalationCount","assignedCount","unassignedCount","ownedCount","queueCount")) {
  Assert ($null -ne $res.careLoad.$field) "careLoad.$field should exist"
}

Assert ($null -ne $res.followups) "followups should exist"
foreach ($field in @("total","resolved","escalated","overdue","atRisk","onTrack")) {
  Assert ($null -ne $res.followups.$field) "followups.$field should exist"
}
Assert ($null -ne $res.followups.owners) "followups.owners should exist"

Assert ($null -ne $res.formation) "formation should exist"
Assert ($null -ne $res.formation.totalProfiles) "formation.totalProfiles should exist"
Assert ($null -ne $res.formation.byStage) "formation.byStage should exist"
Assert ($null -ne $res.formation.projectedJourney) "formation.projectedJourney should exist"
Assert ($null -ne $res.formation.milestoneSignals) "formation.milestoneSignals should exist"
Assert ($null -ne $res.formation.cohorts) "formation.cohorts should exist"
Assert ($null -ne $res.formation.opportunities) "formation.opportunities should exist"
Assert ($null -ne $res.formation.opportunities.items) "formation.opportunities.items should exist"

Assert ($null -ne $res.projectionIntegrity) "projectionIntegrity should exist"
Assert ($null -ne $res.projectionIntegrity.orphanProfilesExcluded) "projectionIntegrity.orphanProfilesExcluded should exist"

Write-Host "OK: activity intelligence contract passed."