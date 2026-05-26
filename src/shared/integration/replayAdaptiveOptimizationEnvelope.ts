import {
  computeReplayAdaptiveOptimizationScore
} from "./replayAdaptiveOptimizationScore";

import {
  buildReplayRuntimeEfficiencyAnalytics
} from "./replayRuntimeEfficiencyAnalytics";

import {
  forecastReplayOptimizationConvergence
} from "./replayOptimizationConvergenceForecast";

export function buildReplayAdaptiveOptimizationEnvelope(args: {
  throughput?: number;
  recoveryScore?: number;
  queuePressure?: number;
  processed?: number;
  durationSeconds?: number;
  retries?: number;
}) {
  const optimizationScore =
    computeReplayAdaptiveOptimizationScore(args);

  const runtimeEfficiency =
    buildReplayRuntimeEfficiencyAnalytics(args);

  return {
    adaptiveOptimizationVersion: 1,
    deterministicAdaptiveOptimization: true,
    optimizationScore,
    runtimeEfficiency,
    optimizationForecast:
      forecastReplayOptimizationConvergence({
        optimizationScore,
        efficiency:
          runtimeEfficiency.efficiency,
        queuePressure:
          args.queuePressure
      })
  };
}
