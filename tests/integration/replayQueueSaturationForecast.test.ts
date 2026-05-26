import assert from "node:assert/strict";

import {
  forecastReplayQueueSaturation
} from "../../src/shared/integration/replayQueueSaturationForecast";

const out =
  forecastReplayQueueSaturation({
    queuePressure: 0.9,
    throughput: 2000
  });

assert.equal(
  out.saturated,
  true
);

assert.ok(
  out.saturationRisk >= 75
);

console.log(
  "replayQueueSaturationForecast.test.ts passed"
);
