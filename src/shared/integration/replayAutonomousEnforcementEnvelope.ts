import {
  computeReplayEnforcementScore
} from "./replayEnforcementScore";

import {
  buildReplayEnforcementAnalytics
} from "./replayEnforcementAnalytics";

import {
  forecastReplayEnforcementDrift
} from "./replayEnforcementDriftForecast";

export function buildReplayAutonomousEnforcementEnvelope(args: {
  enforced?: number;
  violations?: number;
  overrides?: number;
  queuePressure?: number;
}) {
  return {
    enforcementVersion: 1,
    deterministicEnforcement: true,
    enforcementScore:
      computeReplayEnforcementScore(args),
    enforcementAnalytics:
      buildReplayEnforcementAnalytics(args),
    enforcementForecast:
      forecastReplayEnforcementDrift(args)
  };
}
