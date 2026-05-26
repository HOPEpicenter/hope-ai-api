import assert from "node:assert/strict";

import {
  computeReplayContinuityScore
} from "../../src/shared/integration/replayContinuityScore";

const out =
  computeReplayContinuityScore({
    sustained: 96,
    interruptions: 2,
    recoveries: 3
  });

assert.ok(out >= 90);

console.log(
  "replayContinuityScore.test.ts passed"
);
