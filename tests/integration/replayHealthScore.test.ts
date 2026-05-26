import assert from "node:assert/strict";

import {
  computeReplayHealthScore
} from "../../src/shared/integration/replayHealthScore";

const score =
  computeReplayHealthScore({
    scanned: 100,
    drifted: 5,
    repaired: 5,
    failed: 0
  });

assert.ok(score >= 90);

console.log(
  "replayHealthScore.test.ts passed"
);
