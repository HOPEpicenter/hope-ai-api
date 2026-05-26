import assert from "node:assert/strict";

import {
  forecastReplayTrustDrift
} from "../../src/shared/integration/replayTrustDriftForecast";

const out =
  forecastReplayTrustDrift({
    anomalies: 3,
    overrides: 2,
    queuePressure: 0.4
  });

assert.equal(
  out.trustDrifting,
  true
);

assert.ok(
  out.trustDriftRisk >= 0.5
);

console.log(
  "replayTrustDriftForecast.test.ts passed"
);
