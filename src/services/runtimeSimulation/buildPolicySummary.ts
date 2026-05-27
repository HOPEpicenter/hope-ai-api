export function buildPolicySummary() {
  return {
    deterministic: true,
    policyReady: true,
    policyMode: "READ_ONLY_POLICY",
    governanceAligned: true,
    replayPolicyAligned: true,
    snapshotPolicyAligned: true,
    exportPolicyAligned: true,
    consistencyPolicyAligned: true,
    opsOnlyPolicy: true
  };
}