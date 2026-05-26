import assert from "node:assert/strict";

import {
  forecastReplayStability
} from "../../src/shared/integration/replayStabilityForecast";

const score =
  forecastReplayStability({
    healthScore: 95,
    recoveryScore: 90,
    reliabilityRate: 0.98
  });

assert.ok(score >= 90);

console.log(
  "replayStabilityForecast.test.ts passed"
);
