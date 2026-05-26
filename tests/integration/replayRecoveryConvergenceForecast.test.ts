import assert from "node:assert/strict";

import {
  forecastReplayRecoveryConvergence
} from "../../src/shared/integration/replayRecoveryConvergenceForecast";

const out =
  forecastReplayRecoveryConvergence({
    divergenceRisk: 0.1,
    recoveryScore: 95,
    queuePressure: 0.1
  });

assert.equal(
  out.converging,
  true
);

assert.ok(
  out.convergenceConfidence >= 0.7
);

console.log(
  "replayRecoveryConvergenceForecast.test.ts passed"
);
