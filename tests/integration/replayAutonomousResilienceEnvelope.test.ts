import assert from "node:assert/strict";

import {
  buildReplayAutonomousResilienceEnvelope
} from "../../src/shared/integration/replayAutonomousResilienceEnvelope";

const out =
  buildReplayAutonomousResilienceEnvelope({
    sustained: 97,
    interruptions: 1,
    recoveries: 2,
    queuePressure: 0.1
  });

assert.equal(
  out.resilienceVersion,
  1
);

assert.equal(
  out.resilienceAnalytics.resilient,
  true
);

assert.equal(
  out.continuityForecast.continuityDrifting,
  false
);

console.log(
  "replayAutonomousResilienceEnvelope.test.ts passed"
);
