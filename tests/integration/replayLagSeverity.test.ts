import assert from "node:assert/strict";

import {
  classifyReplayLagSeverity
} from "../../src/shared/integration/replayLagSeverity";

assert.equal(
  classifyReplayLagSeverity(0),
  "none"
);

assert.equal(
  classifyReplayLagSeverity(1000),
  "low"
);

assert.equal(
  classifyReplayLagSeverity(
    1000 * 60 * 60 * 2
  ),
  "medium"
);

assert.equal(
  classifyReplayLagSeverity(
    1000 * 60 * 60 * 24 * 2
  ),
  "high"
);

console.log("replayLagSeverity.test.ts passed");
