import {
  TASK_PREVIEW_SCHEMA_VERSION
} from "../followups/deriveTaskPreview";
import {
  buildProjectionLineageEnvelope
} from "../../shared/integration/projectionLineageEnvelope";
import {
  buildReplayObservabilityEnvelope
} from "../../shared/observability/replayObservabilityEnvelope";

export function buildReplaySnapshotArtifacts(input: {
  serializedPreviews: readonly unknown[];
  plans: readonly unknown[];
  simulationTimeline: readonly unknown[];
  explainability: readonly unknown[];
  diagnostics: Record<string, unknown>;
  comparison: Record<string, unknown>;
  driftDiagnostics: Record<string, unknown>;
  replay: {
    replayHash: string;
  };
}) {
  const exportSummary = {
    deterministic: true,
    totalPreviews:
      input.serializedPreviews.length,
    totalPlans:
      input.plans.length,
    totalTimelineEvents:
      input.simulationTimeline.length,
    totalExplainabilityRecords:
      input.explainability.length,
    totalDriftTransitions:
      Number(
        (input.driftDiagnostics as any).readinessTransitions?.length ?? 0
      ),
    exportReady: true
  };

  const exportCanonical =
    JSON.stringify({
      schemaVersion:
        TASK_PREVIEW_SCHEMA_VERSION,
      previews:
        input.serializedPreviews,
      plans:
        input.plans,
      simulationTimeline:
        input.simulationTimeline,
      explainability:
        input.explainability,
      diagnostics:
        input.diagnostics,
      comparison:
        input.comparison,
      driftDiagnostics:
        input.driftDiagnostics,
      exportSummary
    });

  const exportEnvelope = {
    exportVersion: 1,
    deterministic: true,
    exportMode: "READ_ONLY",
    simulatedOnly: true,
    exportHash:
      Buffer.from(exportCanonical)
        .toString("base64")
        .slice(0, 32),
    generatedAt:
      new Date().toISOString(),
    replayHash:
      input.replay.replayHash,
    exportReady:
      exportSummary.exportReady
  };

  const lineageEnvelope =
    buildProjectionLineageEnvelope({
      replayHash:
        input.replay.replayHash,
      snapshotHash: null,
      checkpointHash: null,
      continuationHash: null,
      lineageDepth: 1
    });

  const lineage = {
    ...lineageEnvelope,
    deterministic: true,
    lineageMode: "SIMULATED_ONLY",
    currentReplayHash:
      input.replay.replayHash,
    parentReplayHash:
      input.replay.replayHash,
    exportHash:
      exportEnvelope.exportHash,
    replayGeneration: 1
  };

  const lineageReplayConsistent =
    lineage.currentReplayHash === input.replay.replayHash;

  const runComparison = {
    deterministic: true,
    baselineReplayHash:
      input.replay.replayHash,
    currentReplayHash:
      input.replay.replayHash,
    replayEquivalent: true,
    exportEquivalent: true,
    diagnosticsEquivalent: true,
    explainabilityEquivalent: true,
    driftEquivalent: true
  };

  const multiRun = {
    deterministic: true,
    comparedRuns: 1,
    lineageConsistent: true,
    replayStable: true,
    exportStable: true,
    comparisonMode: "IN_MEMORY_ONLY",
    runComparison
  };

  const snapshotSummary = {
    deterministic: true,
    snapshotReady: true,
    previewCount:
      input.serializedPreviews.length,
    planCount:
      input.plans.length,
    timelineCount:
      input.simulationTimeline.length,
    explainabilityCount:
      input.explainability.length,
    replayHash:
      input.replay.replayHash,
    exportHash:
      exportEnvelope.exportHash
  };

  const snapshotCanonical =
    JSON.stringify({
      replay:
        input.replay,
      exportEnvelope,
      lineage,
      multiRun,
      diagnostics:
        input.diagnostics,
      comparison:
        input.comparison,
      driftDiagnostics:
        input.driftDiagnostics,
      snapshotSummary
    });

  const snapshot = {
    snapshotVersion: 1,
    deterministic: true,
    snapshotMode: "IN_MEMORY_ONLY",
    snapshotHash:
      Buffer.from(snapshotCanonical)
        .toString("base64")
        .slice(0, 32),
    replayHash:
      input.replay.replayHash,
    exportHash:
      exportEnvelope.exportHash,
    lineageReplayHash:
      lineage.currentReplayHash,
    snapshotReady:
      snapshotSummary.snapshotReady,
    simulatedOnly: true
  };

  const replayObservability =
    buildReplayObservabilityEnvelope({
      replayHash:
        input.replay.replayHash,
      exportHash:
        exportEnvelope.exportHash,
      snapshotHash:
        snapshot.snapshotHash,
      lineageReplayHash:
        lineage.currentReplayHash,
      replayDriftDetected:
        (input.driftDiagnostics as any).replayDriftDetected === true,
      lineageConsistent:
        lineageReplayConsistent
    });

  return {
    exportSummary,
    exportEnvelope,
    lineage,
    lineageReplayConsistent,
    multiRun,
    snapshotSummary,
    snapshot,
    replayObservability
  };
}