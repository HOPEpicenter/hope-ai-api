import assert from "node:assert/strict";

import {
  forecastReplayCapacity
} from "../../src/shared/integration/replayCapacityForecast";

const out =
  forecastReplayCapacity({
    throughput: 1000,
    utilizationRate: 0.75
  });

assert.equal(
  out.remainingCapacity,
  250
);

assert.equal(
  out.constrained,
  false
);

console.log(
  "replayCapacityForecast.test.ts passed"
);
