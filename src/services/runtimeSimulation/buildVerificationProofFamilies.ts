export function buildVerificationProofFamilies(input: {
  governance: {
    governanceMode: string;
    governanceStable: boolean;
    executionProhibited: boolean;
  };
  replay: {
    simulatedOnly: boolean;
  };
  exportEnvelope: {
    exportMode?: string;
    simulatedOnly: boolean;
  };
  snapshot: {
    snapshotMode?: string;
    simulatedOnly: boolean;
  };
  consistency: {
    consistencyMode: string;
    consistencyStable: boolean;
  };
  governanceSummary: {
    opsSurfaceOnly: boolean;
  };
  policy?: Record<string, unknown> & {
    policyStable?: boolean;
  };
  compliance?: Record<string, unknown> & {
    complianceStable?: boolean;
  };
}) {
  const policyProofs = {
    deterministic: true,
    governancePolicyProof:
      input.governance.governanceMode === "OPS_READ_ONLY",
    replayPolicyProof:
      input.replay.simulatedOnly === true,
    exportPolicyProof:
      input.exportEnvelope.exportMode === "READ_ONLY",
    snapshotPolicyProof:
      input.snapshot.snapshotMode === "IN_MEMORY_ONLY",
    consistencyPolicyProof:
      input.consistency.consistencyMode === "READ_ONLY_IN_MEMORY",
    safetyBoundaryProof:
      input.governance.executionProhibited === true,
    opsBoundaryProof:
      input.governanceSummary.opsSurfaceOnly === true
  };

  const complianceProofs = {
    deterministic: true,
    governanceComplianceProof:
      input.governance.governanceStable === true,
    policyComplianceProof:
      input.policy?.policyStable === true,
    replayComplianceProof:
      input.replay.simulatedOnly === true,
    exportComplianceProof:
      input.exportEnvelope.simulatedOnly === true,
    snapshotComplianceProof:
      input.snapshot.simulatedOnly === true,
    consistencyComplianceProof:
      input.consistency.consistencyStable === true,
    opsBoundaryComplianceProof:
      input.governanceSummary.opsSurfaceOnly === true
  };

  const attestationProofs = {
    deterministic: true,
    governanceAttestationProof:
      input.governance.governanceStable === true,
    policyAttestationProof:
      input.policy?.policyStable === true,
    complianceAttestationProof:
      input.compliance?.complianceStable === true,
    replayAttestationProof:
      input.replay.simulatedOnly === true,
    exportAttestationProof:
      input.exportEnvelope.simulatedOnly === true,
    snapshotAttestationProof:
      input.snapshot.simulatedOnly === true,
    consistencyAttestationProof:
      input.consistency.consistencyStable === true,
    opsBoundaryAttestationProof:
      input.governanceSummary.opsSurfaceOnly === true
  };

  return {
    policyProofs,
    complianceProofs,
    attestationProofs
  };
}