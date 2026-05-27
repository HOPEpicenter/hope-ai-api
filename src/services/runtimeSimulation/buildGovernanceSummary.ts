export function buildGovernanceSummary() {
  return {
    deterministic: true,
    governanceReady: true,
    orchestrationPermitted: false,
    persistencePermitted: false,
    schedulerPermitted: false,
    mutationPermitted: false,
    executionPermitted: false,
    readOnlyVerified: true,
    opsSurfaceOnly: true
  };
}