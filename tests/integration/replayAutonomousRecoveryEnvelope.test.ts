import assert from "node:assert/strict";

import {
  buildReplayAutonomousRecoveryEnvelope
} from "../../src/shared/integration/replayAutonomousRecoveryEnvelope";

const out =
  buildReplayAutonomousRecoveryEnvelope({
    repaired: 10,
    autonomousRepairs: 8,
    manualRepairs: 1,
    failed: 1,
    divergenceRisk: 0.1,
    queuePressure: 0.1
  });

assert.equal(
  out.autonomousRecoveryVersion,
  1
);

assert.equal(
  out.selfHealingAnalytics.selfHealing,
  true
);

assert.equal(
  out.convergenceForecast.converging,
  true
);

console.log(
  "replayAutonomousRecoveryEnvelope.test.ts passed"
);
