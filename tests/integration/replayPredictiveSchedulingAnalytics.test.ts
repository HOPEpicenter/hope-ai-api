import assert from "node:assert/strict";

import {
  buildReplayPredictiveSchedulingAnalytics
} from "../../src/shared/integration/replayPredictiveSchedulingAnalytics";

const out =
  buildReplayPredictiveSchedulingAnalytics({
    scheduled: 100,
    delayed: 10,
    predictedDurationSeconds: 45
  });

assert.equal(
  out.stableScheduling,
  true
);

assert.ok(
  out.scheduleReliability >= 0.8
);

console.log(
  "replayPredictiveSchedulingAnalytics.test.ts passed"
);
