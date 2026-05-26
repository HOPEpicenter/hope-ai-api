import {
  classifyReplaySla
} from "./replaySlaClassification";

import {
  forecastReplayTimeoutRisk
} from "./replayTimeoutRiskForecast";

export function buildReplayServiceReliabilityEnvelope(args: {
  latencyMs?: number;
  timeoutMs?: number;
  queuePressure?: number;
}) {
  return {
    reliabilityVersion: 1,
    deterministicReliability: true,
    slaClassification:
      classifyReplaySla(args),
    timeoutForecast:
      forecastReplayTimeoutRisk(args)
  };
}
