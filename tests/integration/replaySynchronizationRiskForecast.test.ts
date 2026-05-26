import assert from "node:assert/strict";

import {
  forecastReplaySynchronizationRisk
} from "../../src/shared/integration/replaySynchronizationRiskForecast";

const out =
  forecastReplaySynchronizationRisk({
    blocked: 3,
    queuePressure: 0.8,
    timeoutRisk: 0.9
  });

assert.equal(
  out.unstable,
  true
);

assert.ok(
  out.synchronizationRisk >= 0.75
);

console.log(
  "replaySynchronizationRiskForecast.test.ts passed"
);
