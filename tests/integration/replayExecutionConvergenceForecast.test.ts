import assert from "node:assert/strict";

import {
  forecastReplayExecutionConvergence
} from "../../src/shared/integration/replayExecutionConvergenceForecast";

const out =
  forecastReplayExecutionConvergence({
    optimizationScore: 90,
    schedulingReliability: 0.9,
    queuePressure: 0.1
  });

assert.equal(
  out.converged,
  true
);

assert.ok(
  out.executionConvergence >= 0.75
);

console.log(
  "replayExecutionConvergenceForecast.test.ts passed"
);
