import {
  TASK_PREVIEW_SCHEMA_VERSION,
  groupTaskPreviews,
  summarizeTaskPreviewPlans,
  summarizeTaskPreviews
} from "../followups/deriveTaskPreview";

export function buildOpsTaskPreviewSimulationResponse(input: {
  queue: any;
  includeResolved: boolean;
  previews: any[];
  plans: any[];
  serializedPreviews: readonly unknown[];
  simulationTimeline: readonly unknown[];
  replay: unknown;
  auditEnvelope: unknown;
  explainability: unknown;
  diagnostics: unknown;
  comparison: unknown;
  driftDiagnostics: unknown;
  exportSummary: unknown;
  exportEnvelope: unknown;
  lineage: unknown;
  multiRun: unknown;
  snapshotSummary: unknown;
  snapshot: unknown;
  snapshotCompatibility: unknown;
  consistencySummary: unknown;
  integrityProofs: unknown;
  consistency: unknown;
  governanceSummary: unknown;
  safetyProofs: unknown;
  governance: unknown;
  policySummary: unknown;
  policyProofs: unknown;
  policy: unknown;
  complianceSummary: unknown;
  complianceProofs: unknown;
  compliance: unknown;
  attestationSummary: unknown;
  attestationProofs: unknown;
  attestation: unknown;
  certificationSummary: unknown;
  certificationProofs: unknown;
  certification: unknown;
  accreditationSummary: unknown;
  accreditationProofs: unknown;
  accreditation: unknown;
  trustSeal: unknown;
  assuranceSummary: unknown;
  assuranceProofs: unknown;
  assurance: unknown;
  observabilitySummary: unknown;
  verificationTelemetry: unknown;
  trustDiagnostics: unknown;
  intelligenceSummary: unknown;
  analyticsSummary: unknown;
  replayAnalytics: unknown;
  trustAnalytics: unknown;
  governanceIntelligence: unknown;
  observabilityAnalytics: unknown;
}) {
  return {
    ok: true,
    v: 1,
    schemaVersion:
      TASK_PREVIEW_SCHEMA_VERSION,
    mode: "read-only",
    orchestrationActive: false,
    taskPersistenceActive: false,
    assignedTo:
      input.queue.assignedTo,
    visitorId:
      input.queue.visitorId,
    includeResolved:
      input.includeResolved,
    cursor:
      input.queue.cursor,
    nextCursor:
      input.queue.nextCursor,
    queueStats:
      input.queue.stats,
    previewSummary:
      summarizeTaskPreviews(input.previews),
    planSummary:
      summarizeTaskPreviewPlans(input.plans),
    groupedPreviews:
      groupTaskPreviews(input.previews),
    previews:
      input.serializedPreviews,
    plans:
      input.plans,
    simulationTimeline:
      input.simulationTimeline,
    replay:
      input.replay,
    auditEnvelope:
      input.auditEnvelope,
    explainability:
      input.explainability,
    diagnostics:
      input.diagnostics,
    comparison:
      input.comparison,
    driftDiagnostics:
      input.driftDiagnostics,
    exportSummary:
      input.exportSummary,
    exportEnvelope:
      input.exportEnvelope,
    lineage:
      input.lineage,
    multiRun:
      input.multiRun,
    snapshotSummary:
      input.snapshotSummary,
    snapshot:
      input.snapshot,
    snapshotCompatibility:
      input.snapshotCompatibility,
    consistencySummary:
      input.consistencySummary,
    integrityProofs:
      input.integrityProofs,
    consistency:
      input.consistency,
    governanceSummary:
      input.governanceSummary,
    safetyProofs:
      input.safetyProofs,
    governance:
      input.governance,
    policySummary:
      input.policySummary,
    policyProofs:
      input.policyProofs,
    policy:
      input.policy,
    complianceSummary:
      input.complianceSummary,
    complianceProofs:
      input.complianceProofs,
    compliance:
      input.compliance,
    attestationSummary:
      input.attestationSummary,
    attestationProofs:
      input.attestationProofs,
    attestation:
      input.attestation,
    certificationSummary:
      input.certificationSummary,
    certificationProofs:
      input.certificationProofs,
    certification:
      input.certification,
    accreditationSummary:
      input.accreditationSummary,
    accreditationProofs:
      input.accreditationProofs,
    accreditation:
      input.accreditation,
    trustSeal:
      input.trustSeal,
    assuranceSummary:
      input.assuranceSummary,
    assuranceProofs:
      input.assuranceProofs,
    assurance:
      input.assurance,
    observabilitySummary:
      input.observabilitySummary,
    verificationTelemetry:
      input.verificationTelemetry,
    trustDiagnostics:
      input.trustDiagnostics,
    intelligenceSummary:
      input.intelligenceSummary,
    analyticsSummary:
      input.analyticsSummary,
    replayAnalytics:
      input.replayAnalytics,
    trustAnalytics:
      input.trustAnalytics,
    governanceIntelligence:
      input.governanceIntelligence,
    observabilityAnalytics:
      input.observabilityAnalytics
  };
}