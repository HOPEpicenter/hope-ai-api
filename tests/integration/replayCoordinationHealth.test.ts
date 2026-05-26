import assert from "node:assert/strict";

import {
  computeReplayCoordinationHealth
} from "../../src/shared/integration/replayCoordinationHealth";

const out =
  computeReplayCoordinationHealth({
    blocked: 1,
    synchronized: 9,
    total: 10
  });

assert.ok(out >= 70);

console.log(
  "replayCoordinationHealth.test.ts passed"
);
