import assert from "node:assert/strict";

import {
  computeReplayAdaptiveOptimizationScore
} from "../../src/shared/integration/replayAdaptiveOptimizationScore";

const out =
  computeReplayAdaptiveOptimizationScore({
    throughput: 80,
    recoveryScore: 95,
    queuePressure: 0.1
  });

assert.ok(out >= 75);

console.log(
  "replayAdaptiveOptimizationScore.test.ts passed"
);
