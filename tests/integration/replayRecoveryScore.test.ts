import assert from "node:assert/strict";

import {
  computeReplayRecoveryScore
} from "../../src/shared/integration/replayRecoveryScore";

const score =
  computeReplayRecoveryScore({
    repaired: 8,
    failed: 1,
    drifted: 10
  });

assert.ok(score >= 70);

console.log(
  "replayRecoveryScore.test.ts passed"
);
