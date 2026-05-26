import assert from "node:assert/strict";

import {
  buildReplayResilienceAnalytics
} from "../../src/shared/integration/replayResilienceAnalytics";

const out =
  buildReplayResilienceAnalytics({
    sustained: 98,
    interruptions: 1,
    recoveries: 2
  });

assert.equal(
  out.resilient,
  true
);

assert.ok(
  out.resilienceIntegrity >= 0.9
);

console.log(
  "replayResilienceAnalytics.test.ts passed"
);
