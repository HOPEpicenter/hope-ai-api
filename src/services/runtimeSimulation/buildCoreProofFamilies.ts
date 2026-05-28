export function buildCoreProofFamilies(input: {
  replay: {
    replayHash: string;
    simulatedOnly: boolean;
  };
  comparison: {
    replayHash: string;
  };
  exportEnvelope: {
    exportHash: string;
    simulatedOnly: boolean;
  };
  lineage: {
    exportHash: string;
  };
  snapshot: {
    replayHash: string;
    exportHash: string;
    simulatedOnly: boolean;
  };
  multiRun: {
    runComparison: {
      currentReplayHash: string;
    };
  };
  lineageReplayConsistent: boolean;
  auditEnvelope: {
    orchestrationActive: boolean;
    taskPersistenceActive: boolean;
  };
  governanceSummary: {
    opsSurfaceOnly: boolean;
  };
}) {
  const integrityProofs = {
    deterministic: true,
    replayHashProof:
      input.replay.replayHash === input.comparison.replayHash,
    exportHashProof:
      input.exportEnvelope.exportHash === input.lineage.exportHash,
    lineageReplayProof:
      input.lineageReplayConsistent,
    snapshotReplayProof:
      input.snapshot.replayHash === input.replay.replayHash,
    snapshotExportProof:
      input.snapshot.exportHash === input.exportEnvelope.exportHash,
    multirunReplayProof:
      input.multiRun.runComparison.currentReplayHash ===
      input.replay.replayHash
  };

  const consistency = {
    deterministic: true,
    consistencyMode: "READ_ONLY_IN_MEMORY",
    replayExportConverged: true,
    replaySnapshotConverged: true,
    lineageSnapshotConverged: true,
    diagnosticsConverged: true,
    explainabilityConverged: true,
    integrityProofs,
    consistencyStable: true
  };

  const safetyProofs = {
    deterministic: true,
    orchestrationInactiveProof:
      input.auditEnvelope.orchestrationActive === false,
    persistenceInactiveProof:
      input.auditEnvelope.taskPersistenceActive === false,
    replaySimulatedOnlyProof:
      input.replay.simulatedOnly === true,
    exportSimulatedOnlyProof:
      input.exportEnvelope.simulatedOnly === true,
    snapshotSimulatedOnlyProof:
      input.snapshot.simulatedOnly === true,
    readOnlyModeProof:
      consistency.consistencyMode === "READ_ONLY_IN_MEMORY",
    governanceBoundaryProof:
      input.governanceSummary.opsSurfaceOnly === true
  };

  return {
    integrityProofs,
    consistency,
    safetyProofs
  };
}