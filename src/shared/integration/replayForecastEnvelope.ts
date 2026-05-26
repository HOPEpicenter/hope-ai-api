import {
  forecastReplayStability
} from "./replayStabilityForecast";

import {
  classifyReplayPredictiveRisk
} from "./replayPredictiveRisk";

export function buildReplayForecastEnvelope(args: {
  healthScore?: number;
  recoveryScore?: number;
  reliabilityRate?: number;
  forecastWindow?: number;
}) {
  const stabilityForecast =
    forecastReplayStability(args);

  return {
    forecastVersion: 1,
    deterministicForecast: true,
    stabilityForecast,
    predictiveRisk:
      classifyReplayPredictiveRisk(
        stabilityForecast
      ),
    forecastWindow:
      Number(args.forecastWindow ?? 0)
  };
}
