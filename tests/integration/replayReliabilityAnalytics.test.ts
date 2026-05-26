import assert from "node:assert/strict";

import {
  buildReplayReliabilityAnalytics
} from "../../src/shared/integration/replayReliabilityAnalytics";

const out =
  buildReplayReliabilityAnalytics({
    scanned: 100,
    failed: 2,
    repaired: 10
  });

assert.equal(
  out.reliable,
  true
);

assert.ok(
  out.reliabilityRate >= 0.95
);

console.log(
  "replayReliabilityAnalytics.test.ts passed"
);
