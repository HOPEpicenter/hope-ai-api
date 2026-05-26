import {
  computeReplayThroughputScore
} from "./replayThroughputScore";

import {
  classifyReplayLoad
} from "./replayLoadClassification";

import {
  forecastReplayCapacity
} from "./replayCapacityForecast";

export function buildReplayThroughputEnvelope(args: {
  processed?: number;
  durationSeconds?: number;
  utilizationRate?: number;
}) {
  const throughput =
    computeReplayThroughputScore(args);

  return {
    throughputVersion: 1,
    deterministicThroughput: true,
    throughput,
    loadClassification:
      classifyReplayLoad(
        throughput
      ),
    capacityForecast:
      forecastReplayCapacity({
        throughput,
        utilizationRate:
          args.utilizationRate
      })
  };
}
