import assert from "node:assert/strict";

import {
  buildReplayAdaptiveOptimizationEnvelope
} from "../../src/shared/integration/replayAdaptiveOptimizationEnvelope";

const out =
  buildReplayAdaptiveOptimizationEnvelope({
    throughput: 85,
    recoveryScore: 95,
    queuePressure: 0.1,
    processed: 300,
    durationSeconds: 20,
    retries: 1
  });

assert.equal(
  out.adaptiveOptimizationVersion,
  1
);

assert.equal(
  out.runtimeEfficiency.efficient,
  true
);

assert.equal(
  out.optimizationForecast.optimized,
  true
);

console.log(
  "replayAdaptiveOptimizationEnvelope.test.ts passed"
);
