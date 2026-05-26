import assert from "node:assert/strict";

import {
  classifyReplayBackpressure
} from "../../src/shared/integration/replayBackpressureClassification";

assert.equal(
  classifyReplayBackpressure(0.1),
  "normal"
);

assert.equal(
  classifyReplayBackpressure(0.3),
  "elevated"
);

assert.equal(
  classifyReplayBackpressure(0.6),
  "pressured"
);

assert.equal(
  classifyReplayBackpressure(0.9),
  "critical"
);

console.log(
  "replayBackpressureClassification.test.ts passed"
);
