import assert from "node:assert/strict";

import {
  compareReplayContinuations
} from "../../src/shared/integration/replayContinuationParity";

const out =
  compareReplayContinuations({
    current: {
      replayHash: "abc"
    },
    resumed: {
      replayHash: "abc"
    }
  });

assert.equal(
  out.deterministicContinuationParity,
  true
);

assert.equal(
  out.currentHash,
  out.resumedHash
);

console.log(
  "replayContinuationParity.test.ts passed"
);
