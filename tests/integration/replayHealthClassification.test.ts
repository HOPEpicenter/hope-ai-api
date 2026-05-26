import assert from "node:assert/strict";

import {
  classifyReplayHealth
} from "../../src/shared/integration/replayHealthClassification";

assert.equal(
  classifyReplayHealth(95),
  "healthy"
);

assert.equal(
  classifyReplayHealth(80),
  "stable"
);

assert.equal(
  classifyReplayHealth(60),
  "degraded"
);

assert.equal(
  classifyReplayHealth(25),
  "critical"
);

console.log(
  "replayHealthClassification.test.ts passed"
);
