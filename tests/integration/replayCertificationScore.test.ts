import assert from "node:assert/strict";

import {
  computeReplayCertificationScore
} from "../../src/shared/integration/replayCertificationScore";

const out =
  computeReplayCertificationScore({
    certified: 96,
    failed: 2,
    overrides: 1
  });

assert.ok(out >= 85);

console.log(
  "replayCertificationScore.test.ts passed"
);
