import assert from "node:assert/strict";

import {
  forecastReplayCertificationDrift
} from "../../src/shared/integration/replayCertificationDriftForecast";

const out =
  forecastReplayCertificationDrift({
    failed: 3,
    overrides: 2,
    queuePressure: 0.4
  });

assert.equal(
  out.certificationDrifting,
  true
);

assert.ok(
  out.certificationDriftRisk >= 0.5
);

console.log(
  "replayCertificationDriftForecast.test.ts passed"
);
