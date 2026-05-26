import assert from "node:assert/strict";

import {
  computeReplayQuorumHealth
} from "../../src/shared/integration/replayQuorumHealth";

const out =
  computeReplayQuorumHealth({
    replicas: 10,
    aligned: 9
  });

assert.equal(out, 90);

console.log(
  "replayQuorumHealth.test.ts passed"
);
