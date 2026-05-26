import assert from "node:assert/strict";

import {
  forecastReplayTimeoutRisk
} from "../../src/shared/integration/replayTimeoutRiskForecast";

const out =
  forecastReplayTimeoutRisk({
    latencyMs: 900,
    timeoutMs: 1000,
    queuePressure: 0.8
  });

assert.equal(
  out.highRisk,
  true
);

assert.ok(
  out.timeoutRisk >= 0.75
);

console.log(
  "replayTimeoutRiskForecast.test.ts passed"
);
