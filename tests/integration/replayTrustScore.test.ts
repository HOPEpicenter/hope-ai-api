import assert from "node:assert/strict";

import {
  computeReplayTrustScore
} from "../../src/shared/integration/replayTrustScore";

const out =
  computeReplayTrustScore({
    verified: 95,
    anomalies: 2,
    overrides: 1
  });

assert.ok(out >= 85);

console.log(
  "replayTrustScore.test.ts passed"
);
