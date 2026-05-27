export function buildReplayAnalyticsSummary(input: {
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
  comparison: {
    replayEquivalent: boolean;
  };
  replayObservability: {
    replayDriftDetected: boolean;
    lineageConsistent: boolean;
    telemetryAligned: boolean;
  };
  trustSeal: {
    trustSealState: string;
  };
  trustDiagnostics: {
    trustSealVerified: boolean;
    assuranceStable: boolean;
  };
  assurance: {
    assuranceStable: boolean;
  };
  accreditation: {
    accreditationStable: boolean;
  };
  certification: {
    certificationStable: boolean;
  };
  observabilitySummary: {
    observabilityReady: boolean;
    previewCount: number;
    planCount: number;
    timelineCount: number;
    explainabilityCount: number;
  };
  verificationTelemetry: {
    totalSimulationRecords: number;
  };
}) {
  const analyticsSummary = {
    deterministic: true,
    analyticsVersion: 1,
    analyticsMode: "IN_MEMORY_ROLLUP_ONLY",
    totalPreviews:
      input.serializedPreviews.length,
    totalPlans:
      input.plans.length,
    totalTimelineEvents:
      input.simulationTimeline.length,
    totalExplainabilityRecords:
      input.explainability.length,
    totalAnomalies:
      input.diagnostics.anomalyCount,
    totalSuppressed:
      input.diagnostics.suppressedCount,
    simulatedOnly: true
  };

  const replayAnalytics = {
    deterministic: true,
    replayAnalyticsVersion: 1,
    replayHash:
      input.replay.replayHash,
    replayStable:
      input.comparison.replayEquivalent === true,
    replayDriftDetected:
      input.replayObservability.replayDriftDetected,
    lineageConsistent:
      input.replayObservability.lineageConsistent,
    simulatedOnly: true
  };

  const trustAnalytics = {
    deterministic: true,
    trustAnalyticsVersion: 1,
    trustSealVerified:
      input.trustSeal.trustSealState === "TRUST_SEAL_VERIFIED",
    trustDiagnosticsHealthy:
      input.trustDiagnostics.trustSealVerified === true &&
      input.trustDiagnostics.assuranceStable === true,
    assuranceTrusted:
      input.assurance.assuranceStable === true,
    accreditationTrusted:
      input.accreditation.accreditationStable === true,
    certificationTrusted:
      input.certification.certificationStable === true,
    simulatedOnly: true
  };

  const observabilityAnalytics = {
    deterministic: true,
    observabilityAnalyticsVersion: 1,
    observabilityReady:
      input.observabilitySummary.observabilityReady === true,
    telemetryAligned:
      input.replayObservability.telemetryAligned,
    observableRecordCount:
      input.observabilitySummary.previewCount +
      input.observabilitySummary.planCount +
      input.observabilitySummary.timelineCount +
      input.observabilitySummary.explainabilityCount,
    telemetryRecordCount:
      input.verificationTelemetry.totalSimulationRecords,
    simulatedOnly: true
  };

  return {
    analyticsSummary,
    replayAnalytics,
    trustAnalytics,
    observabilityAnalytics
  };
}