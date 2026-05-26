import assert from "node:assert/strict";

import {
  classifyReplayPredictiveRisk
} from "../../src/shared/integration/replayPredictiveRisk";

assert.equal(
  classifyReplayPredictiveRisk(95),
  "minimal"
);

assert.equal(
  classifyReplayPredictiveRisk(80),
  "elevated"
);

assert.equal(
  classifyReplayPredictiveRisk(60),
  "high"
);

assert.equal(
  classifyReplayPredictiveRisk(25),
  "severe"
);

console.log(
  "replayPredictiveRisk.test.ts passed"
);
