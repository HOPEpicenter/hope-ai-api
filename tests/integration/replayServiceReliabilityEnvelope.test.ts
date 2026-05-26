import assert from "node:assert/strict";

import {
  buildReplayServiceReliabilityEnvelope
} from "../../src/shared/integration/replayServiceReliabilityEnvelope";

const out =
  buildReplayServiceReliabilityEnvelope({
    latencyMs: 950,
    timeoutMs: 1000,
    queuePressure: 0.9
  });

assert.equal(
  out.reliabilityVersion,
  1
);

assert.equal(
  out.slaClassification,
  "breached"
);

assert.equal(
  out.timeoutForecast.highRisk,
  true
);

console.log(
  "replayServiceReliabilityEnvelope.test.ts passed"
);
