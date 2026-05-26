import assert from "node:assert/strict";

import {
  buildReplayQueueDepthAnalytics
} from "../../src/shared/integration/replayQueueDepthAnalytics";

const out =
  buildReplayQueueDepthAnalytics({
    queued: 50,
    inflight: 25,
    processed: 25
  });

assert.equal(out.total, 100);
assert.equal(out.queuePressure, 0.5);

console.log(
  "replayQueueDepthAnalytics.test.ts passed"
);
