export function buildObservabilitySummary(input: {
  serializedPreviews: readonly unknown[];
  plans: readonly unknown[];
  simulationTimeline: readonly unknown[];
  explainability: readonly unknown[];
  diagnostics: {
    anomalyCount: number;
    suppressedCount: number;
  };
  replay: {
    replayHash: string;
  };
  exportEnvelope: {
    exportHash: string;
  };
  replayObservability: {
    snapshotHash: string;
  };
  lineage: {
    currentReplayHash: string;
  };
}) {
  const observabilitySummary = {
    deterministic: true,
    observabilityReady: true,
    observabilityMode: "OPS_READ_ONLY_OBSERVABLE",
    previewCount:
      input.serializedPreviews.length,
    planCount:
      input.plans.length,
    timelineCount:
      input.simulationTimeline.length,
    explainabilityCount:
      input.explainability.length,
    anomalyCount:
      input.diagnostics.anomalyCount,
    suppressedCount:
      input.diagnostics.suppressedCount,
    trustSealVisible: true,
    assuranceVisible: true
  };

  const verificationTelemetry = {
    deterministic: true,
    telemetryVersion: 1,
    replayHash:
      input.replay.replayHash,
    exportHash:
      input.exportEnvelope.exportHash,
    snapshotHash:
      input.replayObservability.snapshotHash,
    lineageReplayHash:
      input.lineage.currentReplayHash,
    totalProofFamilies: 9,
    totalSimulationRecords:
      input.serializedPreviews.length +
      input.plans.length +
      input.simulationTimeline.length +
      input.explainability.length,
    simulatedOnly: true
  };

  return {
    observabilitySummary,
    verificationTelemetry
  };
}