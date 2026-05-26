import assert from "node:assert/strict";

import {
  buildReplayRuntimeEfficiencyAnalytics
} from "../../src/shared/integration/replayRuntimeEfficiencyAnalytics";

const out =
  buildReplayRuntimeEfficiencyAnalytics({
    processed: 200,
    durationSeconds: 10,
    retries: 1
  });

assert.equal(
  out.efficient,
  true
);

assert.ok(
  out.efficiency >= 10
);

console.log(
  "replayRuntimeEfficiencyAnalytics.test.ts passed"
);
