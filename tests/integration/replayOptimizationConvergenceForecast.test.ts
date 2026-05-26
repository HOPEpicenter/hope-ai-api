import assert from "node:assert/strict";

import {
  forecastReplayOptimizationConvergence
} from "../../src/shared/integration/replayOptimizationConvergenceForecast";

const out =
  forecastReplayOptimizationConvergence({
    optimizationScore: 90,
    efficiency: 25,
    queuePressure: 0.1
  });

assert.equal(
  out.optimized,
  true
);

assert.ok(
  out.optimizationConvergence >= 0.75
);

console.log(
  "replayOptimizationConvergenceForecast.test.ts passed"
);
