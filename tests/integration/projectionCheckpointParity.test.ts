import assert from "node:assert/strict";

import {
  compareProjectionCheckpoints
} from "../../src/shared/integration/projectionCheckpointParity";

const out =
  compareProjectionCheckpoints({
    current: {
      replayHash: "abc"
    },
    rebuilt: {
      replayHash: "abc"
    }
  });

assert.equal(
  out.deterministicCheckpointParity,
  true
);

assert.equal(
  out.currentHash,
  out.rebuiltHash
);

console.log(
  "projectionCheckpointParity.test.ts passed"
);
