import assert from "node:assert/strict";

import {
  buildReplayOrchestrationTimingIntelligence
} from "../../src/shared/integration/replayOrchestrationTimingIntelligence";

const out =
  buildReplayOrchestrationTimingIntelligence({
    averageLatencyMs: 120,
    queuePressure: 0.2,
    retries: 1
  });

assert.equal(
  out.responsive,
  true
);

assert.ok(
  out.orchestrationTimingScore >= 70
);

console.log(
  "replayOrchestrationTimingIntelligence.test.ts passed"
);
