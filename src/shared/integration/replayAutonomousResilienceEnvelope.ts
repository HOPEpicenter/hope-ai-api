import {
  computeReplayContinuityScore
} from "./replayContinuityScore";

import {
  buildReplayResilienceAnalytics
} from "./replayResilienceAnalytics";

import {
  forecastReplayContinuityDrift
} from "./replayContinuityDriftForecast";

export function buildReplayAutonomousResilienceEnvelope(args: {
  sustained?: number;
  interruptions?: number;
  recoveries?: number;
  queuePressure?: number;
}) {
  return {
    resilienceVersion: 1,
    deterministicResilience: true,
    continuityScore:
      computeReplayContinuityScore(args),
    resilienceAnalytics:
      buildReplayResilienceAnalytics(args),
    continuityForecast:
      forecastReplayContinuityDrift(args)
  };
}
