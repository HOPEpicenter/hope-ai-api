import assert from "node:assert/strict";

import {
  computeReplayThroughputScore
} from "../../src/shared/integration/replayThroughputScore";

const out =
  computeReplayThroughputScore({
    processed: 1000,
    durationSeconds: 10
  });

assert.equal(out, 100);

console.log(
  "replayThroughputScore.test.ts passed"
);
