import assert from "node:assert/strict";

import {
  computeReplayAutonomousRecoveryScore
} from "../../src/shared/integration/replayAutonomousRecoveryScore";

const out =
  computeReplayAutonomousRecoveryScore({
    repaired: 8,
    autonomousRepairs: 6,
    failed: 2
  });

assert.ok(out >= 90);

console.log(
  "replayAutonomousRecoveryScore.test.ts passed"
);
