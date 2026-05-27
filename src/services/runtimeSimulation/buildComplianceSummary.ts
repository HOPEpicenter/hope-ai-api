export function buildComplianceSummary() {
  return {
    deterministic: true,
    complianceReady: true,
    complianceMode: "OPS_READ_ONLY_COMPLIANT",
    governanceComplianceAligned: true,
    replayComplianceAligned: true,
    snapshotComplianceAligned: true,
    exportComplianceAligned: true,
    consistencyComplianceAligned: true,
    opsOnlyCompliance: true
  };
}