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

Assert ($null -ne $response.simulationTimeline) "simulationTimeline should exist"
Assert ($null -ne $response.replay) "replay should exist"
Assert ($null -ne $response.auditEnvelope) "auditEnvelope should exist"
Assert ($null -ne $response.explainability) "explainability should exist"
Assert ($null -ne $response.diagnostics) "diagnostics should exist"

Assert ($response.previews -is [array]) "previews should be an array"
Assert ($response.plans -is [array]) "plans should be an array"
Assert ($response.simulationTimeline -is [array]) "simulationTimeline should be an array"
Assert ($response.explainability -is [array]) "explainability should be an array"

Assert (
  $response.planSummary.totalPlans -eq $response.plans.Count
) "plan summary total should match plans count"

Assert (
  $response.previewSummary.total -eq $response.previews.Count
) "preview summary total should match previews count"

Assert (
  $response.simulationTimeline.Count -eq $response.plans.Count
) "timeline count should reconcile with plans"

Assert (
  $response.explainability.Count -eq $response.plans.Count
) "explainability count should reconcile with plans"

Assert (
  ($response.planSummary.readyPlans +
   $response.planSummary.suppressedPlans +
   $response.planSummary.stalePlans) -eq
   $response.planSummary.totalPlans
) "plan readiness counts should reconcile"

Assert (
  $response.replay.replayVersion -eq 1
) "replayVersion should be 1"

Assert (
  $response.replay.replayDeterministic -eq $true
) "replay should be deterministic"

Assert (
  $response.replay.simulatedOnly -eq $true
) "replay should remain simulatedOnly"

Assert (
  -not [string]::IsNullOrWhiteSpace($response.replay.replayHash)
) "replayHash should exist"

Assert (
  $response.auditEnvelope.simulationMode -eq "READ_ONLY"
) "auditEnvelope simulationMode should be READ_ONLY"

Assert (
  $response.auditEnvelope.orchestrationActive -eq $false
) "auditEnvelope orchestrationActive should be false"

Assert (
  $response.auditEnvelope.taskPersistenceActive -eq $false
) "auditEnvelope taskPersistenceActive should be false"

Assert (
  $response.auditEnvelope.replayDeterministic -eq $true
) "auditEnvelope replayDeterministic should be true"

Assert (
  $response.auditEnvelope.timelineDeterministic -eq $true
) "auditEnvelope timelineDeterministic should be true"

Assert (
  $response.auditEnvelope.simulatedOnly -eq $true
) "auditEnvelope simulatedOnly should be true"

Assert (
  $response.auditEnvelope.replayHash -eq $response.replay.replayHash
) "auditEnvelope replayHash should reconcile"

Assert (
  $response.diagnostics.deterministic -eq $true
) "diagnostics should be deterministic"

Assert (
  $response.diagnostics.replayConsistent -eq $true
) "diagnostics replayConsistent should be true"

Assert (
  $response.diagnostics.timelineConsistent -eq $true
) "diagnostics timelineConsistent should be true"

Assert (
  $response.diagnostics.suppressedCount -eq $response.planSummary.suppressedPlans
) "diagnostics suppressedCount should reconcile"

for ($i = 0; $i -lt $response.simulationTimeline.Count; $i++) {
  $event = $response.simulationTimeline[$i]

  Assert (
    $event.sequence -eq ($i + 1)
  ) "timeline sequence ordering should remain deterministic"

  Assert (
    $event.eventType -eq "SIMULATED_TASK_EVALUATION"
  ) "timeline eventType should match"

  Assert (
    $event.simulatedOnly -eq $true
  ) "timeline events should remain simulatedOnly"

  Assert (
    @("WOULD_QUEUE_TASK", "NO_ACTION") -contains $event.simulatedAction
  ) "timeline simulatedAction should be recognized"
}

foreach ($explanation in $response.explainability) {
  Assert (
    $null -ne $explanation.reasoningTree
  ) "each explanation should include reasoningTree"

  Assert (
    $null -ne $explanation.trace
  ) "each explanation should include trace"

  Assert (
    $explanation.trace.replayHash -eq $response.replay.replayHash
  ) "explanation trace should reconcile replayHash"

  Assert (
    $explanation.trace.deterministic -eq $true
  ) "explanation trace should be deterministic"

  Assert (
    $explanation.anomalyFlags -is [array]
  ) "explanation anomalyFlags should be an array"

  Assert (
    $explanation.suppressionReasonsExpanded -is [array]
  ) "suppressionReasonsExpanded should be an array"
}

foreach ($plan in $response.plans) {
  Assert (
    $plan.schemaVersion -eq 1
  ) "each plan should expose schemaVersion"

  Assert (
    $plan.candidateTaskType -eq "FOLLOWUP"
  ) "each plan should be FOLLOWUP type"

  Assert (
    @("READY", "SUPPRESSED", "STALE") -contains $plan.planReadiness
  ) "planReadiness should be recognized"
}

Write-Host "OK: OPS task preview simulation assertion passed."

