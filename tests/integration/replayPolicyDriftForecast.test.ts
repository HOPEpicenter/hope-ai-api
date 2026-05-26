import assert from "node:assert/strict";

import {
  forecastReplayPolicyDrift
} from "../../src/shared/integration/replayPolicyDriftForecast";

const out =
  forecastReplayPolicyDrift({
    violations: 4,
    overrides: 2,
    queuePressure: 0.5
  });

assert.equal(
  out.policyDrifting,
  true
);

assert.ok(
  out.driftRisk >= 0.5
);

console.log(
  "replayPolicyDriftForecast.test.ts passed"
);
