import assert from "node:assert/strict";

import {
  computeReplayEnforcementScore
} from "../../src/shared/integration/replayEnforcementScore";

const out =
  computeReplayEnforcementScore({
    enforced: 96,
    violations: 2,
    overrides: 1
  });

assert.ok(out >= 85);

console.log(
  "replayEnforcementScore.test.ts passed"
);
