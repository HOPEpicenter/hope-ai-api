import assert from "node:assert/strict";

import {
  buildReplayPredictiveOrchestrationEnvelope
} from "../../src/shared/integration/replayPredictiveOrchestrationEnvelope";

const out =
  buildReplayPredictiveOrchestrationEnvelope({
    scheduled: 120,
    delayed: 8,
    predictedDurationSeconds: 40,
    averageLatencyMs: 100,
    queuePressure: 0.1,
    retries: 1,
    optimizationScore: 92
  });

assert.equal(
  out.predictiveOrchestrationVersion,
  1
);

assert.equal(
  out.scheduling.stableScheduling,
  true
);

assert.equal(
  out.executionForecast.converged,
  true
);

console.log(
  "replayPredictiveOrchestrationEnvelope.test.ts passed"
);
