import assert from "node:assert/strict";

import {
  computeReplayGovernancePolicyScore
} from "../../src/shared/integration/replayGovernancePolicyScore";

const out =
  computeReplayGovernancePolicyScore({
    compliant: 90,
    violations: 5,
    overrides: 2
  });

assert.ok(out >= 80);

console.log(
  "replayGovernancePolicyScore.test.ts passed"
);
