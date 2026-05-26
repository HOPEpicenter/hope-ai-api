import {
  computeReplayGovernancePolicyScore
} from "./replayGovernancePolicyScore";

import {
  buildReplayComplianceAnalytics
} from "./replayComplianceAnalytics";

import {
  forecastReplayPolicyDrift
} from "./replayPolicyDriftForecast";

export function buildReplayAutonomousGovernanceEnvelope(args: {
  compliant?: number;
  violations?: number;
  overrides?: number;
  queuePressure?: number;
}) {
  return {
    governanceVersion: 1,
    deterministicGovernance: true,
    governanceScore:
      computeReplayGovernancePolicyScore(
        args
      ),
    compliance:
      buildReplayComplianceAnalytics(
        args
      ),
    policyForecast:
      forecastReplayPolicyDrift(args)
  };
}
