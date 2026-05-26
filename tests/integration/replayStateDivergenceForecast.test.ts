import assert from "node:assert/strict";

import {
  forecastReplayStateDivergence
} from "../../src/shared/integration/replayStateDivergenceForecast";

const out =
  forecastReplayStateDivergence({
    divergent: 3,
    queuePressure: 0.8,
    synchronizationRisk: 0.9
  });

assert.equal(
  out.unstable,
  true
);

assert.ok(
  out.divergenceRisk >= 0.75
);

console.log(
  "replayStateDivergenceForecast.test.ts passed"
);
