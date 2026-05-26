import assert from "node:assert/strict";

import {
  forecastReplayDriftTrend
} from "../../src/shared/integration/replayDriftTrendForecast";

const out =
  forecastReplayDriftTrend({
    currentDriftRate: 0.05,
    previousDriftRate: 0.1
  });

assert.equal(out.improving, true);
assert.equal(out.worsening, false);

console.log(
  "replayDriftTrendForecast.test.ts passed"
);
