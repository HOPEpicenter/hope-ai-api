import assert from "node:assert/strict";

import {
  buildReplayThroughputEnvelope
} from "../../src/shared/integration/replayThroughputEnvelope";

const out =
  buildReplayThroughputEnvelope({
    processed: 5000,
    durationSeconds: 5,
    utilizationRate: 0.95
  });

assert.equal(
  out.throughputVersion,
  1
);

assert.equal(
  out.loadClassification,
  "saturated"
);

assert.equal(
  out.capacityForecast.constrained,
  true
);

console.log(
  "replayThroughputEnvelope.test.ts passed"
);
