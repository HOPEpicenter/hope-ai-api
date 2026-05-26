import assert from "node:assert/strict";

import {
  classifyReplayLoad
} from "../../src/shared/integration/replayLoadClassification";

assert.equal(
  classifyReplayLoad(50),
  "light"
);

assert.equal(
  classifyReplayLoad(250),
  "moderate"
);

assert.equal(
  classifyReplayLoad(700),
  "heavy"
);

assert.equal(
  classifyReplayLoad(1500),
  "saturated"
);

console.log(
  "replayLoadClassification.test.ts passed"
);
