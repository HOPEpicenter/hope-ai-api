import {
  buildReplayConsensusStateAnalytics
} from "./replayConsensusStateAnalytics";

import {
  computeReplayQuorumHealth
} from "./replayQuorumHealth";

import {
  forecastReplayStateDivergence
} from "./replayStateDivergenceForecast";

export function buildReplayConsensusEnvelope(args: {
  replicas?: number;
  aligned?: number;
  divergent?: number;
  queuePressure?: number;
  synchronizationRisk?: number;
}) {
  return {
    consensusVersion: 1,
    deterministicConsensus: true,
    consensusState:
      buildReplayConsensusStateAnalytics(args),
    quorumHealth:
      computeReplayQuorumHealth(args),
    divergenceForecast:
      forecastReplayStateDivergence(args)
  };
}
