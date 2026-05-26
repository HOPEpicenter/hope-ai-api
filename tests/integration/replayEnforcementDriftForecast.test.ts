import assert from "node:assert/strict";

import {
  forecastReplayEnforcementDrift
} from "../../src/shared/integration/replayEnforcementDriftForecast";

const out =
  forecastReplayEnforcementDrift({
    violations: 3,
    overrides: 2,
    queuePressure: 0.4
  });

assert.equal(
  out.enforcementDrifting,
  true
);

assert.ok(
  out.enforcementDriftRisk >= 0.5
);

console.log(
  "replayEnforcementDriftForecast.test.ts passed"
);
