import assert from "node:assert/strict";

import {
  buildReplayLatencyEnvelope
} from "../../src/shared/integration/replayLatencyEnvelope";

const out =
  buildReplayLatencyEnvelope({
    latencyMs: 6000,
    queuePressure: 0.7
  });

assert.equal(
  out.backpressure,
  "pressured"
);

assert.equal(
  out.degraded,
  true
);

console.log(
  "replayLatencyEnvelope.test.ts passed"
);
