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
Assert ($null -ne $response.comparison) "comparison should exist"
Assert ($null -ne $response.driftDiagnostics) "driftDiagnostics should exist"
Assert ($null -ne $response.exportSummary) "exportSummary should exist"
Assert ($null -ne $response.exportEnvelope) "exportEnvelope should exist"
Assert ($null -ne $response.lineage) "lineage should exist"
Assert ($null -ne $response.multiRun) "multiRun should exist"
Assert ($null -ne $response.snapshotSummary) "snapshotSummary should exist"
Assert ($null -ne $response.snapshot) "snapshot should exist"
Assert ($null -ne $response.snapshotCompatibility) "snapshotCompatibility should exist"
Assert ($null -ne $response.consistencySummary) "consistencySummary should exist"
Assert ($null -ne $response.integrityProofs) "integrityProofs should exist"
Assert ($null -ne $response.consistency) "consistency should exist"
Assert ($null -ne $response.governanceSummary) "governanceSummary should exist"
Assert ($null -ne $response.safetyProofs) "safetyProofs should exist"
Assert ($null -ne $response.governance) "governance should exist"
Assert ($null -ne $response.policySummary) "policySummary should exist"
Assert ($null -ne $response.policyProofs) "policyProofs should exist"
Assert ($null -ne $response.policy) "policy should exist"
Assert ($null -ne $response.complianceSummary) "complianceSummary should exist"
Assert ($null -ne $response.complianceProofs) "complianceProofs should exist"
Assert ($null -ne $response.compliance) "compliance should exist"

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

Assert (
  $response.comparison.deterministic -eq $true
) "comparison should be deterministic"

Assert (
  $response.comparison.replayEquivalent -eq $true
) "comparison replayEquivalent should be true"

Assert (
  $response.comparison.timelineEquivalent -eq $true
) "comparison timelineEquivalent should be true"

Assert (
  $response.comparison.explainabilityEquivalent -eq $true
) "comparison explainabilityEquivalent should be true"

Assert (
  $response.comparison.replayHash -eq $response.replay.replayHash
) "comparison replayHash should reconcile"

Assert (
  $response.comparison.comparedReplayHash -eq $response.replay.replayHash
) "comparison comparedReplayHash should reconcile"

Assert (
  $response.driftDiagnostics.deterministic -eq $true
) "driftDiagnostics should be deterministic"

Assert (
  $response.driftDiagnostics.replayDriftDetected -eq $false
) "replay drift should remain false"

Assert (
  $response.driftDiagnostics.timelineDriftDetected -eq $false
) "timeline drift should remain false"

Assert (
  $response.driftDiagnostics.explainabilityDriftDetected -eq $false
) "explainability drift should remain false"

Assert (
  $response.driftDiagnostics.divergenceFlags -is [array]
) "divergenceFlags should be an array"

Assert (
  $response.driftDiagnostics.readinessTransitions -is [array]
) "readinessTransitions should be an array"

Assert (
  $response.driftDiagnostics.readinessTransitions.Count -eq $response.plans.Count
) "readinessTransitions should reconcile with plans"

Assert (
  $response.exportSummary.deterministic -eq $true
) "exportSummary should be deterministic"

Assert (
  $response.exportSummary.exportReady -eq $true
) "exportSummary should be exportReady"

Assert (
  $response.exportSummary.totalPreviews -eq $response.previews.Count
) "exportSummary totalPreviews should reconcile"

Assert (
  $response.exportSummary.totalPlans -eq $response.plans.Count
) "exportSummary totalPlans should reconcile"

Assert (
  $response.exportSummary.totalTimelineEvents -eq $response.simulationTimeline.Count
) "exportSummary totalTimelineEvents should reconcile"

Assert (
  $response.exportSummary.totalExplainabilityRecords -eq $response.explainability.Count
) "exportSummary totalExplainabilityRecords should reconcile"

Assert (
  $response.exportSummary.totalDriftTransitions -eq $response.driftDiagnostics.readinessTransitions.Count
) "exportSummary totalDriftTransitions should reconcile"

Assert (
  $response.exportEnvelope.exportVersion -eq 1
) "exportEnvelope exportVersion should be 1"

Assert (
  $response.exportEnvelope.deterministic -eq $true
) "exportEnvelope should be deterministic"

Assert (
  $response.exportEnvelope.exportMode -eq "READ_ONLY"
) "exportEnvelope exportMode should be READ_ONLY"

Assert (
  $response.exportEnvelope.simulatedOnly -eq $true
) "exportEnvelope should be simulatedOnly"

Assert (
  $response.exportEnvelope.exportReady -eq $true
) "exportEnvelope should be exportReady"

Assert (
  -not [string]::IsNullOrWhiteSpace($response.exportEnvelope.exportHash)
) "exportEnvelope exportHash should exist"

Assert (
  $response.exportEnvelope.replayHash -eq $response.replay.replayHash
) "exportEnvelope replayHash should reconcile"

Assert (
  $response.lineage.lineageVersion -eq 1
) "lineageVersion should be 1"

Assert (
  $response.lineage.deterministic -eq $true
) "lineage should be deterministic"

Assert (
  $response.lineage.lineageMode -eq "SIMULATED_ONLY"
) "lineageMode should be SIMULATED_ONLY"

Assert (
  $response.lineage.currentReplayHash -eq $response.replay.replayHash
) "lineage currentReplayHash should reconcile"

Assert (
  $response.lineage.parentReplayHash -eq $response.replay.replayHash
) "lineage parentReplayHash should reconcile"

Assert (
  $response.lineage.exportHash -eq $response.exportEnvelope.exportHash
) "lineage exportHash should reconcile"

Assert (
  $response.lineage.replayGeneration -eq 1
) "lineage replayGeneration should be 1"

Assert (
  $response.multiRun.deterministic -eq $true
) "multiRun should be deterministic"

Assert (
  $response.multiRun.comparedRuns -eq 1
) "multiRun comparedRuns should be 1"

Assert (
  $response.multiRun.lineageConsistent -eq $true
) "multiRun lineageConsistent should be true"

Assert (
  $response.multiRun.replayStable -eq $true
) "multiRun replayStable should be true"

Assert (
  $response.multiRun.exportStable -eq $true
) "multiRun exportStable should be true"

Assert (
  $response.multiRun.comparisonMode -eq "IN_MEMORY_ONLY"
) "multiRun comparisonMode should be IN_MEMORY_ONLY"

Assert (
  $null -ne $response.multiRun.runComparison
) "runComparison should exist"

Assert (
  $response.multiRun.runComparison.deterministic -eq $true
) "runComparison should be deterministic"

Assert (
  $response.multiRun.runComparison.replayEquivalent -eq $true
) "runComparison replayEquivalent should be true"

Assert (
  $response.multiRun.runComparison.exportEquivalent -eq $true
) "runComparison exportEquivalent should be true"

Assert (
  $response.multiRun.runComparison.diagnosticsEquivalent -eq $true
) "runComparison diagnosticsEquivalent should be true"

Assert (
  $response.multiRun.runComparison.explainabilityEquivalent -eq $true
) "runComparison explainabilityEquivalent should be true"

Assert (
  $response.multiRun.runComparison.driftEquivalent -eq $true
) "runComparison driftEquivalent should be true"

Assert (
  $response.multiRun.runComparison.currentReplayHash -eq $response.replay.replayHash
) "runComparison currentReplayHash should reconcile"

Assert (
  $response.multiRun.runComparison.baselineReplayHash -eq $response.replay.replayHash
) "runComparison baselineReplayHash should reconcile"

Assert (
  $response.snapshotSummary.deterministic -eq $true
) "snapshotSummary should be deterministic"

Assert (
  $response.snapshotSummary.snapshotReady -eq $true
) "snapshotSummary should be snapshotReady"

Assert (
  $response.snapshotSummary.previewCount -eq $response.previews.Count
) "snapshotSummary previewCount should reconcile"

Assert (
  $response.snapshotSummary.planCount -eq $response.plans.Count
) "snapshotSummary planCount should reconcile"

Assert (
  $response.snapshotSummary.timelineCount -eq $response.simulationTimeline.Count
) "snapshotSummary timelineCount should reconcile"

Assert (
  $response.snapshotSummary.explainabilityCount -eq $response.explainability.Count
) "snapshotSummary explainabilityCount should reconcile"

Assert (
  $response.snapshotSummary.replayHash -eq $response.replay.replayHash
) "snapshotSummary replayHash should reconcile"

Assert (
  $response.snapshotSummary.exportHash -eq $response.exportEnvelope.exportHash
) "snapshotSummary exportHash should reconcile"

Assert (
  $response.snapshot.snapshotVersion -eq 1
) "snapshotVersion should be 1"

Assert (
  $response.snapshot.deterministic -eq $true
) "snapshot should be deterministic"

Assert (
  $response.snapshot.snapshotMode -eq "IN_MEMORY_ONLY"
) "snapshotMode should be IN_MEMORY_ONLY"

Assert (
  -not [string]::IsNullOrWhiteSpace($response.snapshot.snapshotHash)
) "snapshotHash should exist"

Assert (
  $response.snapshot.replayHash -eq $response.replay.replayHash
) "snapshot replayHash should reconcile"

Assert (
  $response.snapshot.exportHash -eq $response.exportEnvelope.exportHash
) "snapshot exportHash should reconcile"

Assert (
  $response.snapshot.lineageReplayHash -eq $response.lineage.currentReplayHash
) "snapshot lineageReplayHash should reconcile"

Assert (
  $response.snapshot.snapshotReady -eq $true
) "snapshot should be snapshotReady"

Assert (
  $response.snapshot.simulatedOnly -eq $true
) "snapshot should be simulatedOnly"

Assert (
  $response.snapshotCompatibility.deterministic -eq $true
) "snapshotCompatibility should be deterministic"

Assert (
  $response.snapshotCompatibility.replayCompatible -eq $true
) "snapshot replayCompatible should be true"

Assert (
  $response.snapshotCompatibility.exportCompatible -eq $true
) "snapshot exportCompatible should be true"

Assert (
  $response.snapshotCompatibility.lineageCompatible -eq $true
) "snapshot lineageCompatible should be true"

Assert (
  $response.snapshotCompatibility.multiRunCompatible -eq $true
) "snapshot multiRunCompatible should be true"

Assert (
  $response.snapshotCompatibility.diagnosticsCompatible -eq $true
) "snapshot diagnosticsCompatible should be true"

Assert (
  $response.snapshotCompatibility.explainabilityCompatible -eq $true
) "snapshot explainabilityCompatible should be true"

Assert (
  $response.snapshotCompatibility.driftCompatible -eq $true
) "snapshot driftCompatible should be true"

Assert (
  $response.snapshotCompatibility.snapshotStable -eq $true
) "snapshot snapshotStable should be true"

Assert (
  $response.consistencySummary.deterministic -eq $true
) "consistencySummary should be deterministic"

Assert (
  $response.consistencySummary.replayConsistent -eq $true
) "consistencySummary replayConsistent should be true"

Assert (
  $response.consistencySummary.exportConsistent -eq $true
) "consistencySummary exportConsistent should be true"

Assert (
  $response.consistencySummary.lineageConsistent -eq $true
) "consistencySummary lineageConsistent should be true"

Assert (
  $response.consistencySummary.snapshotConsistent -eq $true
) "consistencySummary snapshotConsistent should be true"

Assert (
  $response.consistencySummary.explainabilityConsistent -eq $true
) "consistencySummary explainabilityConsistent should be true"

Assert (
  $response.consistencySummary.diagnosticsConsistent -eq $true
) "consistencySummary diagnosticsConsistent should be true"

Assert (
  $response.consistencySummary.driftConsistent -eq $true
) "consistencySummary driftConsistent should be true"

Assert (
  $response.consistencySummary.consistencyReady -eq $true
) "consistencySummary consistencyReady should be true"

Assert (
  $response.integrityProofs.deterministic -eq $true
) "integrityProofs should be deterministic"

Assert (
  $response.integrityProofs.replayHashProof -eq $true
) "integrity replayHashProof should be true"

Assert (
  $response.integrityProofs.exportHashProof -eq $true
) "integrity exportHashProof should be true"

Assert (
  $response.integrityProofs.lineageReplayProof -eq $true
) "integrity lineageReplayProof should be true"

Assert (
  $response.integrityProofs.snapshotReplayProof -eq $true
) "integrity snapshotReplayProof should be true"

Assert (
  $response.integrityProofs.snapshotExportProof -eq $true
) "integrity snapshotExportProof should be true"

Assert (
  $response.integrityProofs.multirunReplayProof -eq $true
) "integrity multirunReplayProof should be true"

Assert (
  $response.consistency.deterministic -eq $true
) "consistency should be deterministic"

Assert (
  $response.consistency.consistencyMode -eq "READ_ONLY_IN_MEMORY"
) "consistencyMode should be READ_ONLY_IN_MEMORY"

Assert (
  $response.consistency.replayExportConverged -eq $true
) "consistency replayExportConverged should be true"

Assert (
  $response.consistency.replaySnapshotConverged -eq $true
) "consistency replaySnapshotConverged should be true"

Assert (
  $response.consistency.lineageSnapshotConverged -eq $true
) "consistency lineageSnapshotConverged should be true"

Assert (
  $response.consistency.diagnosticsConverged -eq $true
) "consistency diagnosticsConverged should be true"

Assert (
  $response.consistency.explainabilityConverged -eq $true
) "consistency explainabilityConverged should be true"

Assert (
  $response.consistency.consistencyStable -eq $true
) "consistency consistencyStable should be true"

Assert (
  $null -ne $response.consistency.integrityProofs
) "consistency integrityProofs should exist"

Assert (
  $response.governanceSummary.deterministic -eq $true
) "governanceSummary should be deterministic"

Assert (
  $response.governanceSummary.governanceReady -eq $true
) "governanceSummary governanceReady should be true"

Assert (
  $response.governanceSummary.orchestrationPermitted -eq $false
) "governanceSummary orchestrationPermitted should be false"

Assert (
  $response.governanceSummary.persistencePermitted -eq $false
) "governanceSummary persistencePermitted should be false"

Assert (
  $response.governanceSummary.schedulerPermitted -eq $false
) "governanceSummary schedulerPermitted should be false"

Assert (
  $response.governanceSummary.mutationPermitted -eq $false
) "governanceSummary mutationPermitted should be false"

Assert (
  $response.governanceSummary.executionPermitted -eq $false
) "governanceSummary executionPermitted should be false"

Assert (
  $response.governanceSummary.readOnlyVerified -eq $true
) "governanceSummary readOnlyVerified should be true"

Assert (
  $response.governanceSummary.opsSurfaceOnly -eq $true
) "governanceSummary opsSurfaceOnly should be true"

Assert (
  $response.safetyProofs.deterministic -eq $true
) "safetyProofs should be deterministic"

Assert (
  $response.safetyProofs.orchestrationInactiveProof -eq $true
) "orchestrationInactiveProof should be true"

Assert (
  $response.safetyProofs.persistenceInactiveProof -eq $true
) "persistenceInactiveProof should be true"

Assert (
  $response.safetyProofs.replaySimulatedOnlyProof -eq $true
) "replaySimulatedOnlyProof should be true"

Assert (
  $response.safetyProofs.exportSimulatedOnlyProof -eq $true
) "exportSimulatedOnlyProof should be true"

Assert (
  $response.safetyProofs.snapshotSimulatedOnlyProof -eq $true
) "snapshotSimulatedOnlyProof should be true"

Assert (
  $response.safetyProofs.readOnlyModeProof -eq $true
) "readOnlyModeProof should be true"

Assert (
  $response.safetyProofs.governanceBoundaryProof -eq $true
) "governanceBoundaryProof should be true"

Assert (
  $response.governance.deterministic -eq $true
) "governance should be deterministic"

Assert (
  $response.governance.governanceMode -eq "OPS_READ_ONLY"
) "governanceMode should be OPS_READ_ONLY"

Assert (
  $response.governance.executionProhibited -eq $true
) "executionProhibited should be true"

Assert (
  $response.governance.persistenceProhibited -eq $true
) "persistenceProhibited should be true"

Assert (
  $response.governance.schedulerProhibited -eq $true
) "schedulerProhibited should be true"

Assert (
  $response.governance.orchestrationProhibited -eq $true
) "orchestrationProhibited should be true"

Assert (
  $response.governance.mutationProhibited -eq $true
) "mutationProhibited should be true"

Assert (
  $response.governance.simulatedOnly -eq $true
) "governance simulatedOnly should be true"

Assert (
  $response.governance.governanceStable -eq $true
) "governanceStable should be true"

Assert (
  $null -ne $response.governance.safetyProofs
) "governance safetyProofs should exist"

Assert (
  $response.policySummary.deterministic -eq $true
) "policySummary should be deterministic"

Assert (
  $response.policySummary.policyReady -eq $true
) "policySummary policyReady should be true"

Assert (
  $response.policySummary.policyMode -eq "READ_ONLY_POLICY"
) "policyMode should be READ_ONLY_POLICY"

Assert (
  $response.policySummary.governanceAligned -eq $true
) "governanceAligned should be true"

Assert (
  $response.policySummary.replayPolicyAligned -eq $true
) "replayPolicyAligned should be true"

Assert (
  $response.policySummary.snapshotPolicyAligned -eq $true
) "snapshotPolicyAligned should be true"

Assert (
  $response.policySummary.exportPolicyAligned -eq $true
) "exportPolicyAligned should be true"

Assert (
  $response.policySummary.consistencyPolicyAligned -eq $true
) "consistencyPolicyAligned should be true"

Assert (
  $response.policySummary.opsOnlyPolicy -eq $true
) "opsOnlyPolicy should be true"

Assert (
  $response.policyProofs.deterministic -eq $true
) "policyProofs should be deterministic"

Assert (
  $response.policyProofs.governancePolicyProof -eq $true
) "governancePolicyProof should be true"

Assert (
  $response.policyProofs.replayPolicyProof -eq $true
) "replayPolicyProof should be true"

Assert (
  $response.policyProofs.exportPolicyProof -eq $true
) "exportPolicyProof should be true"

Assert (
  $response.policyProofs.snapshotPolicyProof -eq $true
) "snapshotPolicyProof should be true"

Assert (
  $response.policyProofs.consistencyPolicyProof -eq $true
) "consistencyPolicyProof should be true"

Assert (
  $response.policyProofs.safetyBoundaryProof -eq $true
) "safetyBoundaryProof should be true"

Assert (
  $response.policyProofs.opsBoundaryProof -eq $true
) "opsBoundaryProof should be true"

Assert (
  $response.policy.deterministic -eq $true
) "policy should be deterministic"

Assert (
  $response.policy.policyVersion -eq 1
) "policyVersion should be 1"

Assert (
  $response.policy.policyState -eq "ENFORCED_READ_ONLY"
) "policyState should be ENFORCED_READ_ONLY"

Assert (
  $response.policy.orchestrationPolicy -eq "PROHIBITED"
) "orchestrationPolicy should be PROHIBITED"

Assert (
  $response.policy.persistencePolicy -eq "PROHIBITED"
) "persistencePolicy should be PROHIBITED"

Assert (
  $response.policy.schedulerPolicy -eq "PROHIBITED"
) "schedulerPolicy should be PROHIBITED"

Assert (
  $response.policy.mutationPolicy -eq "PROHIBITED"
) "mutationPolicy should be PROHIBITED"

Assert (
  $response.policy.executionPolicy -eq "PROHIBITED"
) "executionPolicy should be PROHIBITED"

Assert (
  $response.policy.simulatedOnly -eq $true
) "policy simulatedOnly should be true"

Assert (
  $response.policy.policyStable -eq $true
) "policyStable should be true"

Assert (
  $null -ne $response.policy.policyProofs
) "policy policyProofs should exist"

Assert (
  $response.complianceSummary.deterministic -eq $true
) "complianceSummary should be deterministic"

Assert (
  $response.complianceSummary.complianceReady -eq $true
) "complianceReady should be true"

Assert (
  $response.complianceSummary.complianceMode -eq "OPS_READ_ONLY_COMPLIANT"
) "complianceMode should be OPS_READ_ONLY_COMPLIANT"

Assert (
  $response.complianceSummary.governanceCompliant -eq $true
) "governanceCompliant should be true"

Assert (
  $response.complianceSummary.policyCompliant -eq $true
) "policyCompliant should be true"

Assert (
  $response.complianceSummary.replayCompliant -eq $true
) "replayCompliant should be true"

Assert (
  $response.complianceSummary.snapshotCompliant -eq $true
) "snapshotCompliant should be true"

Assert (
  $response.complianceSummary.exportCompliant -eq $true
) "exportCompliant should be true"

Assert (
  $response.complianceSummary.consistencyCompliant -eq $true
) "consistencyCompliant should be true"

Assert (
  $response.complianceSummary.opsOnlyCompliant -eq $true
) "opsOnlyCompliant should be true"

Assert (
  $response.complianceProofs.deterministic -eq $true
) "complianceProofs should be deterministic"

Assert (
  $response.complianceProofs.governanceComplianceProof -eq $true
) "governanceComplianceProof should be true"

Assert (
  $response.complianceProofs.policyComplianceProof -eq $true
) "policyComplianceProof should be true"

Assert (
  $response.complianceProofs.replayComplianceProof -eq $true
) "replayComplianceProof should be true"

Assert (
  $response.complianceProofs.exportComplianceProof -eq $true
) "exportComplianceProof should be true"

Assert (
  $response.complianceProofs.snapshotComplianceProof -eq $true
) "snapshotComplianceProof should be true"

Assert (
  $response.complianceProofs.consistencyComplianceProof -eq $true
) "consistencyComplianceProof should be true"

Assert (
  $response.complianceProofs.opsBoundaryComplianceProof -eq $true
) "opsBoundaryComplianceProof should be true"

Assert (
  $response.compliance.deterministic -eq $true
) "compliance should be deterministic"

Assert (
  $response.compliance.complianceVersion -eq 1
) "complianceVersion should be 1"

Assert (
  $response.compliance.complianceState -eq "VERIFIED_READ_ONLY"
) "complianceState should be VERIFIED_READ_ONLY"

Assert (
  $response.compliance.orchestrationCompliance -eq "VERIFIED_PROHIBITED"
) "orchestrationCompliance should be VERIFIED_PROHIBITED"

Assert (
  $response.compliance.persistenceCompliance -eq "VERIFIED_PROHIBITED"
) "persistenceCompliance should be VERIFIED_PROHIBITED"

Assert (
  $response.compliance.schedulerCompliance -eq "VERIFIED_PROHIBITED"
) "schedulerCompliance should be VERIFIED_PROHIBITED"

Assert (
  $response.compliance.mutationCompliance -eq "VERIFIED_PROHIBITED"
) "mutationCompliance should be VERIFIED_PROHIBITED"

Assert (
  $response.compliance.executionCompliance -eq "VERIFIED_PROHIBITED"
) "executionCompliance should be VERIFIED_PROHIBITED"

Assert (
  $response.compliance.simulatedOnly -eq $true
) "compliance simulatedOnly should be true"

Assert (
  $response.compliance.complianceStable -eq $true
) "complianceStable should be true"

Assert (
  $null -ne $response.compliance.complianceProofs
) "compliance complianceProofs should exist"

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

foreach ($transition in $response.driftDiagnostics.readinessTransitions) {
  Assert (
    $transition.deterministic -eq $true
  ) "readiness transition should be deterministic"

  Assert (
    @("READY", "SUPPRESSED", "STALE") -contains $transition.currentReadiness
  ) "transition currentReadiness should be recognized"

  Assert (
    @("READY", "UNCHANGED") -contains $transition.simulatedNextReadiness
  ) "transition simulatedNextReadiness should be recognized"
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









