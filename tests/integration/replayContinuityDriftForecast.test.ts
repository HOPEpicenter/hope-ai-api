import assert from "node:assert/strict";

import {
  forecastReplayContinuityDrift
} from "../../src/shared/integration/replayContinuityDriftForecast";

const out =
  forecastReplayContinuityDrift({
    interruptions: 3,
    recoveries: 1,
    queuePressure: 0.4
  });

assert.equal(
  out.continuityDrifting,
  true
);

assert.ok(
  out.continuityDriftRisk >= 0.5
);

console.log(
  "replayContinuityDriftForecast.test.ts passed"
);
