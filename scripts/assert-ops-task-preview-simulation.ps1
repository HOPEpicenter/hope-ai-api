param(
  [string]$ApiBase = "http://127.0.0.1:7071/api",
  [string]$ApiKey = $env:HOPE_API_KEY
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

function Assert($condition, $message) {
  if (-not $condition) {
    throw "ASSERT FAILED: $message"
  }
}

if ([string]::IsNullOrWhiteSpace($ApiKey)) {
  throw "HOPE_API_KEY is required via -ApiKey or environment variable."
}

Write-Host "=== ASSERT: OPS task preview simulation ==="
Write-Host "ApiBase=$ApiBase"

$headers = @{
  "x-api-key" = $ApiKey
}

$response = Invoke-RestMethod `
  -Method Get `
  -Uri "$ApiBase/ops/task-preview-simulation?limit=10&includeResolved=true" `
  -Headers $headers

Assert ($response.ok -eq $true) "simulation response should be ok"
Assert ($response.mode -eq "read-only") "simulation mode should be read-only"
Assert ($response.orchestrationActive -eq $false) "orchestrationActive should be false"
Assert ($response.taskPersistenceActive -eq $false) "taskPersistenceActive should be false"
Assert ($response.schemaVersion -eq 1) "schemaVersion should be 1"

Assert ($null -ne $response.previewSummary) "previewSummary should exist"
Assert ($null -ne $response.planSummary) "planSummary should exist"
Assert ($null -ne $response.groupedPreviews) "groupedPreviews should exist"
Assert ($null -ne $response.previews) "previews should exist"
Assert ($null -ne $response.plans) "plans should exist"

Assert ($response.previews -is [array]) "previews should be an array"
Assert ($response.plans -is [array]) "plans should be an array"

Assert ($response.planSummary.totalPlans -eq $response.plans.Count) "plan summary total should match plans count"
Assert ($response.previewSummary.total -eq $response.previews.Count) "preview summary total should match previews count"

Assert (
  ($response.planSummary.readyPlans + $response.planSummary.suppressedPlans + $response.planSummary.stalePlans) -eq
  $response.planSummary.totalPlans
) "plan readiness counts should reconcile"

foreach ($plan in $response.plans) {
  Assert ($plan.schemaVersion -eq 1) "each plan should expose schemaVersion"
  Assert ($plan.candidateTaskType -eq "FOLLOWUP") "each plan should be FOLLOWUP type"
  Assert (@("READY", "SUPPRESSED", "STALE") -contains $plan.planReadiness) "planReadiness should be recognized"
}

Write-Host "OK: OPS task preview simulation assertion passed."
