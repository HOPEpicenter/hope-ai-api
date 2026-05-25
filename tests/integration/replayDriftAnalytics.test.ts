import assert from "node:assert/strict";

import {
  buildReplayDriftAnalytics
} from "../../src/shared/integration/replayDriftAnalytics";

const out =
  buildReplayDriftAnalytics({
    scanned: 100,
    drifted: 5,
    repaired: 5,
    failed: 0
  });

assert.equal(out.scanned, 100);
assert.equal(out.driftRate, 0.05);
assert.equal(out.repairRate, 1);
assert.equal(out.healthy, true);

console.log(
  "replayDriftAnalytics.test.ts passed"
);
