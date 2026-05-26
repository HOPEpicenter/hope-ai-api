import {
  buildReplayPredictiveSchedulingAnalytics
} from "./replayPredictiveSchedulingAnalytics";

import {
  buildReplayOrchestrationTimingIntelligence
} from "./replayOrchestrationTimingIntelligence";

import {
  forecastReplayExecutionConvergence
} from "./replayExecutionConvergenceForecast";

export function buildReplayPredictiveOrchestrationEnvelope(args: {
  scheduled?: number;
  delayed?: number;
  predictedDurationSeconds?: number;
  averageLatencyMs?: number;
  queuePressure?: number;
  retries?: number;
  optimizationScore?: number;
}) {
  const scheduling =
    buildReplayPredictiveSchedulingAnalytics(
      args
    );

  const timing =
    buildReplayOrchestrationTimingIntelligence(
      args
    );

  return {
    predictiveOrchestrationVersion: 1,
    deterministicPredictiveOrchestration: true,
    scheduling,
    timing,
    executionForecast:
      forecastReplayExecutionConvergence({
        optimizationScore:
          args.optimizationScore,
        schedulingReliability:
          scheduling.scheduleReliability,
        queuePressure:
          args.queuePressure
      })
  };
}
