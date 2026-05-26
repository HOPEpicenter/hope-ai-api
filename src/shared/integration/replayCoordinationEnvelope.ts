import {
  buildReplayDependencyGraphAnalytics
} from "./replayDependencyGraphAnalytics";

import {
  computeReplayCoordinationHealth
} from "./replayCoordinationHealth";

import {
  forecastReplaySynchronizationRisk
} from "./replaySynchronizationRiskForecast";

export function buildReplayCoordinationEnvelope(args: {
  nodes?: number;
  edges?: number;
  blocked?: number;
  synchronized?: number;
  total?: number;
  queuePressure?: number;
  timeoutRisk?: number;
}) {
  return {
    coordinationVersion: 1,
    deterministicCoordination: true,
    dependencyGraph:
      buildReplayDependencyGraphAnalytics(args),
    coordinationHealth:
      computeReplayCoordinationHealth(args),
    synchronizationForecast:
      forecastReplaySynchronizationRisk(args)
  };
}
