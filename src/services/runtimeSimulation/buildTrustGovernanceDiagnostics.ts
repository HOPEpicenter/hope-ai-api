export function buildTrustGovernanceDiagnostics(input: {
  trustSeal: {
    trustSealState: string;
  };
  assurance: {
    assuranceStable: boolean;
  };
  governance: {
    governanceStable: boolean;
    executionProhibited: boolean;
  };
  policy: Record<string, unknown> & {
    policyStable?: boolean;
    executionPolicy?: string;
  };
  compliance: Record<string, unknown> & {
    complianceStable?: boolean;
    executionCompliance?: string;
  };
  attestation: Record<string, unknown> & {
    attestationStable?: boolean;
  };
  certification: {
    certificationStable: boolean;
  };
  accreditation: {
    accreditationStable: boolean;
  };
  governanceSummary: {
    opsSurfaceOnly: boolean;
  };
}) {
  const trustDiagnostics = {
    deterministic: true,
    diagnosticsVersion: 1,
    trustDiagnosticsMode: "OPS_READ_ONLY_DIAGNOSTICS",
    trustSealVerified:
      input.trustSeal.trustSealState === "TRUST_SEAL_VERIFIED",
    assuranceStable:
      input.assurance.assuranceStable === true,
    governanceStable:
      input.governance.governanceStable === true,
    policyStable:
      input.policy.policyStable === true,
    complianceStable:
      input.compliance.complianceStable === true,
    attestationStable:
      input.attestation.attestationStable === true,
    certificationStable:
      input.certification.certificationStable === true,
    accreditationStable:
      input.accreditation.accreditationStable === true,
    simulatedOnly: true,
    opsOnlyDiagnostic: true
  };

  const intelligenceSummary = {
    deterministic: true,
    intelligenceReady: true,
    intelligenceMode: "OPS_READ_ONLY_INTELLIGENCE",
    analyticsReady: true,
    trustInsightsReady: true,
    governanceInsightsReady: true,
    observabilityInsightsReady: true,
    simulatedOnly: true,
    opsOnlyIntelligence: true
  };

  const governanceIntelligence = {
    deterministic: true,
    governanceIntelligenceVersion: 1,
    governanceStable:
      input.governance.governanceStable === true,
    policyStable:
      input.policy.policyStable === true,
    complianceStable:
      input.compliance.complianceStable === true,
    executionStillProhibited:
      input.governance.executionProhibited === true &&
      input.policy.executionPolicy === "PROHIBITED" &&
      input.compliance.executionCompliance === "VERIFIED_PROHIBITED",
    opsBoundaryStable:
      input.governanceSummary.opsSurfaceOnly === true,
    simulatedOnly: true
  };

  return {
    trustDiagnostics,
    intelligenceSummary,
    governanceIntelligence
  };
}