import assert from "node:assert/strict";

import {
  buildReplayRecoveryEnvelope
} from "../../src/shared/integration/replayRecoveryEnvelope";

const out =
  buildReplayRecoveryEnvelope({
    repaired: 8,
    failed: 1,
    drifted: 10,
    recoveryDepth: 3
  });

assert.equal(
  out.recoveryVersion,
  1
);

assert.equal(
  out.recoveryDepth,
  3
);

assert.ok(
  out.recoveryScore >= 70
);

console.log(
  "replayRecoveryEnvelope.test.ts passed"
);
