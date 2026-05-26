import assert from "node:assert/strict";

import {
  classifyReplayResilience
} from "../../src/shared/integration/replayResilienceClassification";

assert.equal(
  classifyReplayResilience(95),
  "resilient"
);

assert.equal(
  classifyReplayResilience(80),
  "recoverable"
);

assert.equal(
  classifyReplayResilience(60),
  "fragile"
);

assert.equal(
  classifyReplayResilience(25),
  "unstable"
);

console.log(
  "replayResilienceClassification.test.ts passed"
);
