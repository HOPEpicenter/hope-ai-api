import assert from "node:assert/strict";

import {
  classifyReplayDriftSeverity
} from "../../src/shared/integration/replayDriftSeverity";

assert.equal(
  classifyReplayDriftSeverity({
    drifted: false
  }),
  "none"
);

assert.equal(
  classifyReplayDriftSeverity({
    drifted: true,
    driftFieldCount: 2
  }),
  "low"
);

assert.equal(
  classifyReplayDriftSeverity({
    drifted: true,
    driftFieldCount: 6
  }),
  "medium"
);

assert.equal(
  classifyReplayDriftSeverity({
    drifted: true,
    driftFieldCount: 12
  }),
  "high"
);

console.log("replayDriftSeverity.test.ts passed");
