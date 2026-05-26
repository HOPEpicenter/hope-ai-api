import {
  computeReplayTrustScore
} from "./replayTrustScore";

import {
  buildReplayAuditAnalytics
} from "./replayAuditAnalytics";

import {
  forecastReplayTrustDrift
} from "./replayTrustDriftForecast";

export function buildReplayAutonomousAuditEnvelope(args: {
  verified?: number;
  anomalies?: number;
  overrides?: number;
  queuePressure?: number;
}) {
  return {
    auditVersion: 1,
    deterministicAudit: true,
    trustScore:
      computeReplayTrustScore(args),
    auditAnalytics:
      buildReplayAuditAnalytics(args),
    trustForecast:
      forecastReplayTrustDrift(args)
  };
}
