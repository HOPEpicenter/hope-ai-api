import assert from "node:assert/strict";

import {
  classifyReplayAnomalySeverity
} from "../../src/shared/integration/replayAnomalySeverity";

assert.equal(
  classifyReplayAnomalySeverity({
    failed: 0,
    driftRate: 0
  }),
  "none"
);

assert.equal(
  classifyReplayAnomalySeverity({
    failed: 1,
    driftRate: 0.05
  }),
  "low"
);

assert.equal(
  classifyReplayAnomalySeverity({
    failed: 6,
    driftRate: 0.25
  }),
  "medium"
);

assert.equal(
  classifyReplayAnomalySeverity({
    failed: 12,
    driftRate: 0.7
  }),
  "high"
);

console.log(
  "replayAnomalySeverity.test.ts passed"
);
