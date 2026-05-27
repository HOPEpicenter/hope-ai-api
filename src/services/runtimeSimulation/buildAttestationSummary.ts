export function buildAttestationSummary() {
  return {
    deterministic: true,
    attestationReady: true,
    attestationMode: "OPS_READ_ONLY_ATTESTED",
    governanceAttested: true,
    policyAttested: true,
    complianceAttested: true,
    replayAttested: true,
    snapshotAttested: true,
    exportAttested: true,
    consistencyAttested: true,
    opsOnlyAttested: true
  };
}